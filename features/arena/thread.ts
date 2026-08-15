import type { FailureKind } from "@/features/model-call/failure";
import type { CallMetrics } from "@/features/model-call/types";

/**
 * What a screen is handed after a thread has been read out of the database.
 *
 * The database rows are not passed around directly. `costUsd` arrives as a
 * `Decimal`, the status is an enum, and neither belongs in a component; feature
 * 3 decided that conversion happens in one mapper at the edge, and this is that
 * mapper's shape.
 */

export type AnswerState = "streaming" | "complete" | "failed";

export type AnswerView = {
  readonly id: string;
  readonly modelId: string;
  readonly state: AnswerState;
  readonly text: string;
  /** Null until the model call ends, and on a call that never produced one. */
  readonly metrics: CallMetrics | null;
  /**
   * Why a failed answer failed, in the one detail the card acts on. Null unless
   * the state is `failed`. It carries no raw provider text; that stays on the
   * row for the log.
   */
  readonly failure: FailureKind | null;
};

export type TurnView = {
  readonly id: string;
  readonly index: number;
  readonly prompt: string;
  readonly answers: readonly AnswerView[];
  /** Which answer won, once this turn has been voted on. */
  readonly winnerAnswerId: string | null;
};

export type ThreadView = {
  readonly id: string;
  readonly title: string;
  readonly turns: readonly TurnView[];
};

/** Which models a thread is currently racing: whoever answered the last turn. */
export const currentModelIds = (thread: ThreadView): readonly string[] =>
  thread.turns.at(-1)?.answers.map((answer) => answer.modelId) ?? [];

/** A turn is votable once two of its models have actually answered. */
export const completedAnswerCount = (turn: TurnView): number =>
  turn.answers.filter((answer) => answer.state === "complete").length;

const TITLE_LIMIT = 60;

/**
 * A thread is named after the prompt that started it, cut at a word boundary.
 *
 * Asking a model to write the title would cost a call and a wait on every first
 * prompt, to say something the prompt has already said.
 */
export const titleFromPrompt = (prompt: string): string => {
  const collapsed = prompt.replace(/\s+/g, " ").trim();

  if (collapsed.length <= TITLE_LIMIT) return collapsed;

  const cut = collapsed.slice(0, TITLE_LIMIT);
  const lastSpace = cut.lastIndexOf(" ");

  return `${(lastSpace > 20 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
};
