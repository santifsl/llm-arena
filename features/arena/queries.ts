import type { ModelMessage } from "ai";

import { database } from "@/features/database/client";
import {
  AnswerStatus,
  type Answer,
  type Prisma,
} from "@/features/database/generated/client";
import type { CallMetrics } from "@/features/model-call/types";

import { titleFromPrompt, type AnswerView, type ThreadView } from "./thread";

/**
 * Every read and write the arena makes. Feature 3 deliberately shipped the
 * schema with no query layer, because data access written before it has a
 * caller is how a layer-shaped folder starts; this is that caller arriving.
 *
 * Two rules hold across this file. Every function that touches a thread takes
 * the Clerk user id and filters on it, so ownership is part of the query rather
 * than a check somebody has to remember to run first. And nothing here throws
 * for a caller's mistake: a missing or unowned row comes back as `null`, and
 * the action or route above turns that into a plain sentence.
 */

/**
 * How long a claimed, still-streaming answer may go without being written to
 * before another request may take its claim over.
 *
 * `updatedAt` is exactly the moment the claim was taken, because nothing writes
 * to the row between claiming it and finishing it. Five minutes is far longer
 * than any model call this app makes survives, so this can only ever fire on a
 * call whose process is gone.
 */
const STALE_CLAIM_MS = 5 * 60 * 1000;

const STATE_BY_STATUS = {
  [AnswerStatus.STREAMING]: "streaming",
  [AnswerStatus.COMPLETE]: "complete",
  [AnswerStatus.FAILED]: "failed",
} as const;

/**
 * The one place a stored row becomes something a screen can render.
 *
 * `staleStreamingIsFailed` is the difference between a row that was just
 * created and one that is being read back later. Reading a `STREAMING` row back
 * means a stream died with nobody left to finish it, and nothing goes back to
 * rescue it, so it is shown as failed rather than as a spinner that never ends.
 * A row created a millisecond ago is streaming for real, and calling it failed
 * would be a lie the moment the turn starts.
 */
const toAnswerView = (
  answer: Answer,
  staleStreamingIsFailed: boolean,
): AnswerView => ({
  id: answer.id,
  modelId: answer.modelId,
  state:
    staleStreamingIsFailed && answer.status === AnswerStatus.STREAMING
      ? "failed"
      : STATE_BY_STATUS[answer.status],
  text: answer.text,
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
}): Promise<{ readonly thread: ThreadView; readonly turnId: string } | null> =>
  database().$transaction(async (tx) => {
    if (threadId === null) {
      const created = await tx.thread.create({
        data: { clerkUserId, title: titleFromPrompt(prompt) },
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

/**
 * Writes the turn and its answer rows, and returns the whole thread. Only ever
 * called with the thread's row already locked, or on a thread nobody else can
 * have heard of yet.
 */
const appendTurn = async (
  tx: PrismaTransaction,
  threadId: string,
  prompt: string,
  modelIds: readonly string[],
): Promise<{ readonly thread: ThreadView; readonly turnId: string }> => {
  const turns = await tx.turn.count({ where: { threadId } });

  await tx.turn.create({
    data: {
      threadId,
      index: turns,
      prompt,
      answers: { create: modelIds.map((modelId) => ({ modelId })) },
    },
  });

  // Touched so the sidebar's newest-first list is honest about activity.
  const updated = await tx.thread.update({
    where: { id: threadId },
    data: { updatedAt: new Date() },
    include: {
      turns: { orderBy: { index: "asc" }, include: turnWithAnswers },
    },
  });

  return {
    // Just created, so a streaming row is genuinely streaming.
    thread: toThreadView(updated, false),
    turnId: updated.turns[updated.turns.length - 1].id,
  };
};

type ThreadWithTurns = Prisma.ThreadGetPayload<{
  include: { turns: { include: typeof turnWithAnswers } };
}>;

const toThreadView = (
  thread: ThreadWithTurns,
  staleStreamingIsFailed: boolean,
): ThreadView => ({
  id: thread.id,
  title: thread.title ?? "Untitled thread",
  turns: thread.turns.map((turn) => ({
    id: turn.id,
    index: turn.index,
    prompt: turn.prompt,
    answers: turn.answers.map((answer) =>
      toAnswerView(answer, staleStreamingIsFailed),
    ),
    winnerAnswerId: turn.vote?.answerId ?? null,
  })),
});

/** A thread and everything in it, or `null` if it is not this person's. */
export const loadThread = async (
  threadId: string,
  clerkUserId: string,
): Promise<ThreadView | null> => {
  const thread = await database().thread.findFirst({
    where: { id: threadId, clerkUserId },
    include: { turns: { orderBy: { index: "asc" }, include: turnWithAnswers } },
  });

  // Read back later: nothing is streaming into these rows any more.
  return thread === null ? null : toThreadView(thread, true);
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

  return { modelId: answer.modelId, messages };
};

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
): Promise<boolean> => {
  const { count } = await database().answer.updateMany({
    where: { id: answerId, streamClaimId: claimId },
    data: { streamClaimId: null, status: AnswerStatus.FAILED, failureReason },
  });

  return count > 0;
};

export type VoteRefusal =
  | "not-found"
  | "too-few-answers"
  | "answer-not-complete"
  | "already-voted"
  | "failed";

/** Postgres refusing a duplicate, which is a real outcome rather than a crash. */
const isUniqueViolation = (error: unknown): boolean =>
  typeof error === "object" &&
  error !== null &&
  "code" in error &&
  (error as { readonly code?: unknown }).code === "P2002";

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

      console.error("[arena] could not record a vote", { error });

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
  const owned = await database().answer.findFirst({
    where: { id: answerId, turn: { thread: { clerkUserId } } },
    select: { id: true },
  });

  if (owned === null) return null;

  const answer = await database().answer.update({
    where: { id: answerId },
    data: {
      status: AnswerStatus.STREAMING,
      // Clearing the claim is what releases the row to the retry. Any call
      // still running against the old claim can no longer write to it.
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
  });

  return toAnswerView(answer, false);
};
