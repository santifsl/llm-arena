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
    const thread =
      threadId === null
        ? await tx.thread.create({
            data: { clerkUserId, title: titleFromPrompt(prompt) },
          })
        : await tx.thread.findFirst({ where: { id: threadId, clerkUserId } });

    // Someone else's thread, or one that no longer exists.
    if (thread === null) return null;

    const turns = await tx.turn.count({ where: { threadId: thread.id } });

    await tx.turn.create({
      data: {
        threadId: thread.id,
        index: turns,
        prompt,
        answers: { create: modelIds.map((modelId) => ({ modelId })) },
      },
    });

    // Touched so the sidebar's newest-first list is honest about activity.
    const updated = await tx.thread.update({
      where: { id: thread.id },
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
  });

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
export const loadStreamContext = async (
  answerId: string,
  clerkUserId: string,
): Promise<{
  readonly modelId: string;
  readonly messages: readonly ModelMessage[];
} | null> => {
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

/** The model answered. Text and every measured number land in one write. */
export const completeAnswer = async (
  answerId: string,
  text: string,
  metrics: CallMetrics,
): Promise<void> => {
  await database().answer.update({
    where: { id: answerId },
    data: {
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
};

/**
 * The model did not answer. The reason is kept for whoever reads the server
 * log; a person only ever sees the plain sentence the card already carries.
 */
export const failAnswer = async (
  answerId: string,
  failureReason: string,
): Promise<void> => {
  await database().answer.update({
    where: { id: answerId },
    data: { status: AnswerStatus.FAILED, failureReason },
  });
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
