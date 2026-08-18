import type { ModelMessage } from "ai";

import { database } from "@/features/database/client";
import {
  AnswerFailure,
  AnswerStatus,
  type Answer,
  type Prisma,
} from "@/features/database/generated/client";
import {
  MODEL_CALL_TIMEOUT_MS,
  type CallMetrics,
  type FailureKind,
} from "@/features/model-call/types";
import { reportServerException } from "@/features/analytics/server";

import {
  titleFromPrompt,
  UNTITLED_THREAD,
  type AnswerView,
  type ThreadSummary,
  type ThreadView,
} from "./thread";

/**
 * Every read and write the arena makes. Feature 3 deliberately shipped the
 * schema with no query layer, because data access written before it has a
 * caller is how a layer-shaped folder starts; this is that caller arriving.
 *
 * One reader here is not the arena screen: the shell's sidebar lists a person's
 * threads. It lives here anyway, because this is the file that owns reading a
 * thread and filtering it by owner, and a second Prisma thread query in
 * `features/shell/` would be the same query written twice.
 *
 * Two rules hold across this file. Every function that touches a thread takes
 * the Clerk user id and filters on it, so ownership is part of the query rather
 * than a check somebody has to remember to run first. And nothing here throws
 * for a caller's mistake: a missing or unowned row comes back as `null`, and
 * the action or route above turns that into a plain sentence.
 *
 * The first rule has exactly one exception, and it is deliberate rather than an
 * oversight: `loadThread` reads a single thread by id alone, because feature 8
 * made a thread readable by anyone holding its link. It hands the owner's id
 * back with the thread instead of filtering on it, so the decision about what
 * that reader may *do* is made once, by the page, with the answer in hand. A
 * caller that forgets to compare gets a thread it cannot act on: every write
 * below still filters on the owner for itself, and so does the stream route's
 * claim, so nothing depends on that comparison being remembered.
 */

/**
 * How long a claimed, still-streaming answer may go without being written to
 * before another request may take its claim over.
 *
 * `updatedAt` is exactly the moment the claim was taken, because nothing writes
 * to the row between claiming it and finishing it. That makes this a bet that no
 * live call is ever older than this window, and the bet is only safe because
 * `MODEL_CALL_TIMEOUT_MS` enforces it: every call is aborted and written as a
 * failure at that mark, so by the time a claim is this old its call has either
 * finished, failed, or lost its process entirely. It used to be a flat five
 * minutes with nothing enforcing anything, which meant a slow but perfectly
 * healthy stream could be evicted by a second request and its answer thrown
 * away. The margin is what absorbs a write that is landing right now.
 */
const STALE_CLAIM_MS = MODEL_CALL_TIMEOUT_MS + 60 * 1000;

const STATE_BY_STATUS = {
  [AnswerStatus.STREAMING]: "streaming",
  [AnswerStatus.COMPLETE]: "complete",
  [AnswerStatus.FAILED]: "failed",
} as const;

/** The two directions of the same small mapping, kept next to each other. */
const FAILURE_BY_KIND = {
  provider: AnswerFailure.PROVIDER,
  quota: AnswerFailure.QUOTA,
} as const satisfies Record<FailureKind, AnswerFailure>;

const KIND_BY_FAILURE = {
  [AnswerFailure.PROVIDER]: "provider",
  [AnswerFailure.QUOTA]: "quota",
} as const satisfies Record<AnswerFailure, FailureKind>;

/**
 * A `STREAMING` row nobody is driving any more: claimed, or created, longer ago
 * than a call is allowed to run.
 *
 * `updatedAt` is the moment the row was claimed, or the moment it was created
 * if no stream ever reached it, and nothing writes to it in between. So a row
 * older than the window has either ended without being written, which only
 * happens when the process holding it died, or was never picked up at all.
 * `MODEL_CALL_TIMEOUT_MS` is what makes this a rule rather than a guess: every
 * call is aborted and written as a failure at that mark, so no live stream can
 * still be running past it.
 */
const isAbandoned = (answer: Answer): boolean =>
  answer.updatedAt.getTime() < Date.now() - STALE_CLAIM_MS;

/**
 * The one place a stored row becomes something a screen can render.
 *
 * `readBack` is the difference between a row that was just created by the
 * caller and one being read out of the database later. It only matters for a
 * `STREAMING` row, and the rule used to be blunt: read one back and it must be
 * a stream that died, so show it as failed rather than as a spinner that never
 * ends.
 *
 * That was right while the only reader of a thread was the person who had just
 * made it, and feature 8 made it wrong, because the commonest moment to share a
 * link is the second the prompt is sent. A visitor arriving mid-race would have
 * been told every model had failed. The judgement is now made properly instead
 * of assumed: a row written to inside the window a call is allowed to run is
 * genuinely still answering, and only an older one is a dead stream. The
 * owner's own mid-race reload gets more honest for the same reason, since that
 * read said "failed" too.
 *
 * A row created a millisecond ago by `startTurn` skips the question entirely,
 * because calling it anything but streaming would be a lie the moment a turn
 * starts.
 */
const toAnswerView = (answer: Answer, readBack: boolean): AnswerView => ({
  id: answer.id,
  modelId: answer.modelId,
  state:
    readBack && answer.status === AnswerStatus.STREAMING && isAbandoned(answer)
      ? "failed"
      : STATE_BY_STATUS[answer.status],
  text: answer.text,
  // Null on anything that did not fail, so a card cannot show a reason for a
  // call that went fine.
  failure:
    answer.failureKind === null ? null : KIND_BY_FAILURE[answer.failureKind],
  metrics:
    answer.durationMs === null
      ? null
      : {
          timeToFirstTokenMs: answer.timeToFirstTokenMs,
          tokensPerSecond: answer.tokensPerSecond,
          inputTokens: answer.inputTokens,
          outputTokens: answer.outputTokens,
          totalTokens: answer.totalTokens,
          durationMs: answer.durationMs,
          // Decimal crosses the wire as a string, so the conversion to a plain
          // number happens here and nowhere else.
          costUsd: Number(answer.costUsd ?? 0),
        },
});

/** The client handed to a `$transaction` callback. */
type PrismaTransaction = Parameters<
  Parameters<ReturnType<typeof database>["$transaction"]>[0]
>[0];

const turnWithAnswers = {
  answers: { orderBy: { createdAt: "asc" } },
  vote: true,
} satisfies Prisma.TurnInclude;

/**
 * Starts a turn: the thread if there is not one yet, the turn, and one answer
 * row per selected model, all in a single transaction.
 *
 * The rows exist before a single token does, on purpose. Three parallel
 * requests cannot each create the turn without racing for it, the prompt
 * survives every model failing, and the browser gets the ids the vote will
 * need.
 *
 * The transaction covers the writes and stops there. Reading the thread back
 * for the screen happens after the commit, for the reason given below.
 */
export const startTurn = async ({
  clerkUserId,
  threadId,
  prompt,
  modelIds,
}: {
  readonly clerkUserId: string;
  readonly threadId: string | null;
  readonly prompt: string;
  readonly modelIds: readonly string[];
}): Promise<{
  readonly thread: ThreadView;
  readonly turnId: string;
} | null> => {
  const appended = await database().$transaction(async (tx) => {
    if (threadId === null) {
      const created = await tx.thread.create({
        data: { clerkUserId, title: titleFromPrompt(prompt) },
        select: { id: true },
      });

      return appendTurn(tx, created.id, prompt, modelIds);
    }

    // The row lock is what makes the turn index safe. Two submissions to the
    // same thread would otherwise both count the turns before either insert
    // commits, both pick the same index, and one would then be rejected by the
    // unique on `(threadId, index)`, which is a valid prompt lost to a race.
    // Two tabs do it, and so does pressing enter twice quickly, since the
    // composer's guard is React state that has not re-rendered yet.
    //
    // Locking the thread also does the ownership check: a row comes back only
    // if it is this person's. A brand new thread skips it, because nothing else
    // can know its id yet.
    const locked = await tx.$queryRaw<readonly { readonly id: string }[]>`
      SELECT id FROM "Thread" WHERE id = ${threadId} AND "clerkUserId" = ${clerkUserId} FOR UPDATE
    `;

    if (locked.length === 0) return null;

    return appendTurn(tx, threadId, prompt, modelIds);
  });

  if (appended === null) return null;

  // Read after the commit rather than inside it, and this is the whole reason
  // the transaction returns two ids instead of a thread.
  //
  // Every statement here costs a round trip to a pooled database a few hundred
  // milliseconds away, and this is by far the heaviest of them: it returns the
  // thread's entire history, every turn with every answer and vote, where the
  // writes above touch three rows. Running it inside the transaction spent that
  // whole cost holding a row lock, on a query that needs no lock at all — the
  // turn is already durable by then, so a reader can only see more than it
  // would have, never less. Feature 3's budget for the transaction body is five
  // seconds by default, and a thread long enough to be worth sharing was
  // heading for it.
  //
  // The concurrent case gets better rather than worse. A second tab appending
  // its own turn between the commit and this read shows up here, which is the
  // truth of the thread, and it can no longer be mistaken for this caller's own
  // turn: the id comes from the insert now, where it used to be inferred from
  // whichever turn happened to sort last.
  const thread = await database().thread.findUnique({
    where: { id: appended.threadId },
    include: { turns: { orderBy: { index: "asc" }, include: turnWithAnswers } },
  });

  if (thread === null) return null;

  return {
    // Just created, so a streaming row is genuinely streaming.
    thread: toThreadView(thread, false),
    turnId: appended.turnId,
  };
};

/**
 * Writes the turn and its answer rows. Only ever called with the thread's row
 * already locked, or on a thread nobody else can have heard of yet.
 *
 * Deliberately writes and returns ids, nothing more. Reading the thread back is
 * the caller's job, once the transaction has committed.
 */
const appendTurn = async (
  tx: PrismaTransaction,
  threadId: string,
  prompt: string,
  modelIds: readonly string[],
): Promise<{ readonly threadId: string; readonly turnId: string }> => {
  // Counted after the lock above, never alongside it. Folding this into the
  // locking query as a subquery would read the count from the snapshot taken
  // before the lock was granted, which is exactly the race the lock is there to
  // prevent.
  const turns = await tx.turn.count({ where: { threadId } });

  const turn = await tx.turn.create({
    data: {
      threadId,
      index: turns,
      prompt,
      answers: { create: modelIds.map((modelId) => ({ modelId })) },
    },
    select: { id: true },
  });

  // Touched so the sidebar's newest-first list is honest about activity.
  await tx.thread.update({
    where: { id: threadId },
    data: { updatedAt: new Date() },
  });

  return { threadId, turnId: turn.id };
};

type ThreadWithTurns = Prisma.ThreadGetPayload<{
  include: { turns: { include: typeof turnWithAnswers } };
}>;

const toThreadView = (
  thread: ThreadWithTurns,
  readBack: boolean,
): ThreadView => ({
  id: thread.id,
  title: thread.title ?? UNTITLED_THREAD,
  turns: thread.turns.map((turn) => ({
    id: turn.id,
    index: turn.index,
    prompt: turn.prompt,
    answers: turn.answers.map((answer) => toAnswerView(answer, readBack)),
    winnerAnswerId: turn.vote?.answerId ?? null,
  })),
});

/**
 * A thread and everything in it, read by id alone.
 *
 * This is the file's one query that does not filter on the owner, because
 * feature 8 made a thread readable by anyone holding its link. The owner's id
 * comes back alongside it so the page can decide what this particular reader is
 * allowed to do; nothing here decides that, and nothing downstream depends on
 * the page getting it right, since every write checks ownership for itself.
 *
 * `null` is a thread that does not exist, and that is the only not-found there
 * is: a stranger and the owner get the same answer for the same id, so the
 * response never reveals whether an id is real to someone who cannot see it.
 */
export const loadThread = async (
  threadId: string,
): Promise<{
  readonly thread: ThreadView;
  readonly ownerClerkUserId: string;
} | null> => {
  const thread = await database().thread.findUnique({
    where: { id: threadId },
    include: { turns: { orderBy: { index: "asc" }, include: turnWithAnswers } },
  });

  if (thread === null) return null;

  // Read out of the database rather than just written, so a still-streaming row
  // has to justify itself against the clock.
  return {
    thread: toThreadView(thread, true),
    ownerClerkUserId: thread.clerkUserId,
  };
};

/**
 * How many threads the sidebar lists. Far past what fits on screen without
 * scrolling, and short of a person with a long history paying for their whole
 * history on every page load. There is no paging control, on purpose: a
 * sidebar that grows a second scroll affordance is a worse sidebar.
 */
const THREAD_LIST_LIMIT = 50;

/**
 * This person's threads, most recently active first.
 *
 * Ordered by `updatedAt` rather than `createdAt`, because `appendTurn` touches
 * it on every prompt and a list that says "your threads" while ignoring the one
 * you were just typing in would be lying by ordering. The index follows that
 * ordering rather than the other way round.
 */
export const listThreads = async (
  clerkUserId: string,
): Promise<readonly ThreadSummary[]> => {
  const threads = await database().thread.findMany({
    where: { clerkUserId },
    orderBy: { updatedAt: "desc" },
    take: THREAD_LIST_LIMIT,
    select: { id: true, title: true, updatedAt: true },
  });

  return threads.map((thread) => ({
    id: thread.id,
    title: thread.title ?? UNTITLED_THREAD,
    updatedAt: thread.updatedAt,
  }));
};

/**
 * What the stream route needs to answer one row: which model, and that model's
 * own conversation.
 *
 * The history is rebuilt here rather than accepted from the browser. Feature 3
 * shaped `Turn` and `Answer` for exactly this walk: every earlier turn's prompt,
 * followed by this model's answer to it when it produced one. A turn where the
 * model failed contributes only the prompt, which is the truth of what that
 * model has seen.
 */
export const claimAnswerForStream = async (
  answerId: string,
  clerkUserId: string,
  claimId: string,
): Promise<{
  readonly modelId: string;
  readonly turnId: string;
  readonly messages: readonly ModelMessage[];
} | null> => {
  // The claim is the ownership check and the mutual exclusion in one statement.
  // Only one request can move `streamClaimId` off null, so only one can go on
  // to call the provider, and a second request naming the same answer is
  // refused before it costs anything. The row must also still be `STREAMING`:
  // an answer that already finished is not something to answer again.
  //
  // The second half of the `OR` is the recovery path. A claim is released by
  // `completeAnswer` or `failAnswer`, and neither of them runs if the process
  // holding the claim dies mid-call: a deploy, a crash, a function killed at its
  // time limit. Without this the row would keep a claim nobody holds and refuse
  // every later request forever. Taking the claim over is safe for the same
  // reason a retry is: this write moves `streamClaimId` to a new id, so if the
  // abandoned call is somehow still alive, its terminal writes are conditional
  // on a claim it no longer holds and land nowhere.
  const { count } = await database().answer.updateMany({
    where: {
      id: answerId,
      status: AnswerStatus.STREAMING,
      turn: { thread: { clerkUserId } },
      OR: [
        { streamClaimId: null },
        { updatedAt: { lt: new Date(Date.now() - STALE_CLAIM_MS) } },
      ],
    },
    data: { streamClaimId: claimId },
  });

  if (count === 0) return null;

  const answer = await database().answer.findFirst({
    where: { id: answerId, turn: { thread: { clerkUserId } } },
    include: {
      turn: {
        include: {
          thread: {
            include: {
              turns: { orderBy: { index: "asc" }, include: { answers: true } },
            },
          },
        },
      },
    },
  });

  if (answer === null) return null;

  const messages = answer.turn.thread.turns
    .filter((turn) => turn.index <= answer.turn.index)
    .flatMap((turn): readonly ModelMessage[] => {
      const own = turn.answers.find(
        (candidate) =>
          candidate.modelId === answer.modelId &&
          candidate.status === AnswerStatus.COMPLETE &&
          candidate.text !== "",
      );

      return own === undefined
        ? [{ role: "user", content: turn.prompt }]
        : [
            { role: "user", content: turn.prompt },
            { role: "assistant", content: own.text },
          ];
    });

  return { modelId: answer.modelId, turnId: answer.turnId, messages };
};

/**
 * How many answers on this turn have finished.
 *
 * Two is the number that matters: it is the rule `castVote` enforces, and it is
 * the moment a person is first offered a pick. Counted here rather than
 * inferred from the answers already in the browser, because the browser is only
 * one of the places a turn can be watched from and a tab that closed mid-race
 * still produces the completion that crosses the line.
 */
export const countCompleteAnswers = async (turnId: string): Promise<number> =>
  database().answer.count({
    where: { turnId, status: AnswerStatus.COMPLETE },
  });

/**
 * The model answered. Text and every measured number land in one write.
 *
 * Conditional on still holding the claim, and that is the whole point: a call
 * abandoned by a retry finishes eventually and tries to write too, and this is
 * what makes that write land nowhere instead of overwriting the retry's answer
 * with a stale one. Returns whether it applied, so the caller knows whether it
 * is describing something that actually happened.
 */
export const completeAnswer = async (
  answerId: string,
  claimId: string,
  text: string,
  metrics: CallMetrics,
): Promise<boolean> => {
  const { count } = await database().answer.updateMany({
    where: { id: answerId, streamClaimId: claimId },
    data: {
      streamClaimId: null,
      status: AnswerStatus.COMPLETE,
      text,
      timeToFirstTokenMs: metrics.timeToFirstTokenMs,
      tokensPerSecond: metrics.tokensPerSecond,
      inputTokens: metrics.inputTokens,
      outputTokens: metrics.outputTokens,
      totalTokens: metrics.totalTokens,
      durationMs: metrics.durationMs,
      costUsd: metrics.costUsd,
    },
  });

  return count > 0;
};

/**
 * The model did not answer. The reason is kept for whoever reads the server
 * log; a person only ever sees the plain sentence the card already carries.
 */
export const failAnswer = async (
  answerId: string,
  claimId: string,
  failureReason: string,
  failureKind: FailureKind,
): Promise<boolean> => {
  const { count } = await database().answer.updateMany({
    where: { id: answerId, streamClaimId: claimId },
    data: {
      streamClaimId: null,
      status: AnswerStatus.FAILED,
      failureReason,
      failureKind: FAILURE_BY_KIND[failureKind],
    },
  });

  return count > 0;
};

export type VoteRefusal =
  | "not-found"
  | "too-few-answers"
  | "answer-not-complete"
  | "already-voted"
  | "failed";

const hasPrismaCode = (error: unknown, code: string): boolean =>
  typeof error === "object" &&
  error !== null &&
  "code" in error &&
  (error as { readonly code?: unknown }).code === code;

/** Postgres refusing a duplicate, which is a real outcome rather than a crash. */
const isUniqueViolation = (error: unknown): boolean =>
  hasPrismaCode(error, "P2002");

/**
 * An update whose `where` matched nothing. For a conditional update that is the
 * refusal itself rather than a failure, the same way `count === 0` is.
 */
const isMissingRow = (error: unknown): boolean => hasPrismaCode(error, "P2025");

/**
 * Picks the winner of one turn, in a single transaction.
 *
 * This is where the invariant feature 3 recorded as the one the database cannot
 * hold gets enforced: no check constraint can count rows in another table, so
 * "two or more models actually answered" is counted here, inside the
 * transaction, and nowhere else. The UI disables the control below two as well,
 * but that is a courtesy; this is the rule.
 *
 * The other half of the invariant is not checked here on purpose. That the
 * winning answer belongs to the turn being voted on is a composite foreign key
 * in Postgres, so it is already impossible.
 */
export const castVote = async ({
  clerkUserId,
  turnId,
  answerId,
}: {
  readonly clerkUserId: string;
  readonly turnId: string;
  readonly answerId: string;
}): Promise<VoteRefusal | null> =>
  database()
    .$transaction(async (tx): Promise<VoteRefusal | null> => {
      const turn = await tx.turn.findFirst({
        where: { id: turnId, thread: { clerkUserId } },
        include: { answers: true, thread: { select: { id: true } } },
      });

      if (turn === null) return "not-found";

      const winner = turn.answers.find((answer) => answer.id === answerId);

      if (winner === undefined) return "not-found";
      if (winner.status !== AnswerStatus.COMPLETE) return "answer-not-complete";

      const answered = turn.answers.filter(
        (answer) => answer.status === AnswerStatus.COMPLETE,
      ).length;

      if (answered < 2) return "too-few-answers";

      await tx.vote.create({
        data: {
          turnId,
          answerId,
          clerkUserId,
          threadId: turn.thread.id,
        },
      });

      return null;
    })
    .catch((error: unknown) => {
      if (isUniqueViolation(error)) return "already-voted";

      reportServerException("could not record a vote", error, {
        turn_id: turnId,
        answer_id: answerId,
      });

      return "failed";
    });

/**
 * Retrying one model reopens its existing row rather than adding a second one,
 * which is what `(turnId, modelId)` being unique already requires. The old
 * text and the old numbers go, because they described a call that failed.
 */
export const reopenAnswer = async (
  answerId: string,
  clerkUserId: string,
): Promise<AnswerView | null> => {
  const answer = await database()
    .answer.update({
      // Ownership, the status rule, and the write are one statement. Reading the
      // row first and then updating it by id is the read-decide-write shape that
      // produced both of this codebase's earlier concurrency bugs, and there is
      // no reason to keep it here when the filter fits in the update.
      where: {
        id: answerId,
        // A finished answer is not something to run again. The card only ever
        // offers a retry on a failure, so this forbids nothing a person can
        // click; it stops a direct call to the action from wiping an answer that
        // is complete, which would strand any vote already cast for it.
        status: { not: AnswerStatus.COMPLETE },
        turn: { thread: { clerkUserId } },
      },
      data: {
        status: AnswerStatus.STREAMING,
        // Clearing the claim is what releases the row to the retry, including
        // when the claim is still live. That is deliberate: a person clicking
        // retry has been shown a failure, and the card shows one when their
        // connection dropped while the server's own call kept running, or when
        // the process holding the claim died. The retry has to win in both
        // cases, and it is safe to let it, because the abandoned call's terminal
        // writes are conditional on a claim it no longer holds.
        streamClaimId: null,
        text: "",
        failureReason: null,
        timeToFirstTokenMs: null,
        tokensPerSecond: null,
        inputTokens: null,
        outputTokens: null,
        totalTokens: null,
        durationMs: null,
        costUsd: null,
      },
    })
    // No row matched, so this is not a failed answer of this person's. An
    // ordinary refusal, not something to log as a crash.
    .catch((error: unknown) => {
      if (isMissingRow(error)) return null;

      throw error;
    });

  return answer === null ? null : toAnswerView(answer, false);
};
