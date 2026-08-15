"use server";

import { auth } from "@clerk/nextjs/server";

import { captureArenaEvent } from "@/features/analytics/server";
import {
  isCallableModelId,
  MAX_SELECTED_MODELS,
} from "@/features/models/catalog";
import { protectPromptSubmission } from "@/features/security/arcjet";

import { castVote, reopenAnswer, startTurn, type VoteRefusal } from "./queries";
import type { AnswerView, ThreadView } from "./thread";

/**
 * Everything the arena does that is not streaming: starting a turn, and
 * retrying one model.
 *
 * Every action answers with the same shape, and none of them throws at the
 * browser. A refusal is a sentence a person can act on; the reason it happened
 * stays in the server log.
 */

export type ActionResult<T> =
  | ({ readonly ok: true } & T)
  | { readonly ok: false; readonly message: string };

const refuse = (
  message: string,
): { readonly ok: false; readonly message: string } => ({
  ok: false,
  message,
});

const PROMPT_LIMIT = 8000;

/**
 * Sends one prompt to every selected model.
 *
 * The write happens before any model is called: the thread, the turn, and one
 * answer row per model, in a single transaction. The browser gets those ids
 * back and opens one stream per row.
 */
export const submitPrompt = async ({
  threadId,
  prompt,
  modelIds,
}: {
  readonly threadId: string | null;
  readonly prompt: string;
  readonly modelIds: readonly string[];
}): Promise<
  ActionResult<{ readonly thread: ThreadView; readonly turnId: string }>
> => {
  const { userId } = await auth();

  if (!userId) return refuse("Sign in to send a prompt to the arena.");

  const text = prompt.trim();

  if (text === "") return refuse("Write a prompt first.");
  if (text.length > PROMPT_LIMIT) {
    return refuse("That prompt is too long. Shorten it and try again.");
  }
  if (modelIds.length === 0) return refuse("Pick at least one model first.");
  if (modelIds.length > MAX_SELECTED_MODELS) {
    return refuse("Three models at once is the limit.");
  }

  // The last moment a person can still choose a model, so it is where the
  // free-tier gate belongs: the stream route never sees a model id again.
  const callable = await Promise.all(modelIds.map(isCallableModelId));

  if (callable.includes(false)) {
    return refuse(
      "One of those models is not one the arena can send a prompt to.",
    );
  }

  const denial = await protectPromptSubmission({ userId, prompt: text });

  if (denial) return refuse(denial.message);

  const started = await startTurn({
    clerkUserId: userId,
    threadId,
    prompt: text,
    modelIds,
  }).catch((error: unknown) => {
    console.error("[arena] could not start a turn", { error });

    return null;
  });

  if (started === null)
    return refuse("That prompt could not be sent. Try again.");

  captureArenaEvent(userId, "prompt_submitted", {
    thread_id: started.thread.id,
    turn_id: started.turnId,
    model_ids: modelIds,
    model_count: modelIds.length,
    prompt_length: text.length,
    is_follow_up: threadId !== null,
  });

  return { ok: true, ...started };
};

/**
 * The sentence a person reads when a vote is refused. Each one says what to do
 * next, and none of them names a constraint or a table.
 */
const VOTE_REFUSALS: Readonly<Record<VoteRefusal, string>> = {
  "not-found": "That prompt could not be found. Reload the page and try again.",
  "too-few-answers":
    "Two models have to answer before a vote means anything, so this one cannot be scored.",
  "answer-not-complete": "That model did not answer, so it cannot win.",
  "already-voted": "The winner for that prompt is already picked.",
  failed: "That vote could not be saved. Try again.",
};

/**
 * The result of a vote. A refusal carries `settled`: it is true when a winner
 * is already stored for the turn, so the screen keeps the winner it is showing
 * rather than taking it back.
 */
export type VoteResult =
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly message: string;
      readonly settled: boolean;
    };

/**
 * Picks the winner of one turn.
 *
 * The rule that two models must have answered is enforced inside the
 * transaction, not here, because that is the one product invariant the database
 * cannot hold on its own and it needs to be counted where the write happens.
 *
 * Every refusal is captured with its reason, so a vote that fails shows up in
 * data rather than only in the server log.
 */
export const voteForAnswer = async ({
  turnId,
  answerId,
  modelId,
}: {
  readonly turnId: string;
  readonly answerId: string;
  /** For the analytics event only; the vote itself is written by id. */
  readonly modelId: string;
}): Promise<VoteResult> => {
  const { userId } = await auth();

  if (!userId)
    return { ok: false, message: "Sign in to vote.", settled: false };

  const refusal = await castVote({ clerkUserId: userId, turnId, answerId });

  if (refusal !== null) {
    captureArenaEvent(userId, "vote_refused", {
      turn_id: turnId,
      answer_id: answerId,
      model_id: modelId,
      reason: refusal,
    });

    // `already-voted` means a winner is stored, so the screen keeps it.
    return {
      ok: false,
      message: VOTE_REFUSALS[refusal],
      settled: refusal === "already-voted",
    };
  }

  captureArenaEvent(userId, "vote_cast", {
    turn_id: turnId,
    answer_id: answerId,
    model_id: modelId,
  });

  return { ok: true };
};

/** Runs one model again, on the row it already failed in. */
export const retryModel = async (
  answerId: string,
): Promise<ActionResult<{ readonly answer: AnswerView }>> => {
  const { userId } = await auth();

  if (!userId) return refuse("Sign in to send a prompt to the arena.");

  const answer = await reopenAnswer(answerId, userId).catch(
    (error: unknown) => {
      console.error("[arena] could not reopen an answer", { error });

      return null;
    },
  );

  return answer === null
    ? refuse(
        "That model could not be run again. Reload the page and try again.",
      )
    : { ok: true, answer };
};
