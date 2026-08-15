import type { UIMessage } from "ai";

/**
 * The honestly measured numbers for one model call. Every consumer, the
 * response card, the database row, and the PostHog LLM event, reads this same
 * shape, so they can never quietly disagree with each other.
 *
 * `null` means the provider did not report it, which is different from zero.
 */
export type CallMetrics = {
  readonly timeToFirstTokenMs: number | null;
  readonly tokensPerSecond: number | null;
  readonly inputTokens: number | null;
  readonly outputTokens: number | null;
  readonly totalTokens: number | null;
  readonly durationMs: number;
  /** Free-tier models really do cost $0.0000. That is a true measurement. */
  readonly costUsd: number;
};

/** Custom data parts this app streams alongside the model's text. */
export type ArenaDataParts = {
  readonly metrics: CallMetrics;
};

export type ArenaUIMessage = UIMessage<unknown, ArenaDataParts>;

/** One data part id per stream, so a later write replaces rather than appends. */
export const METRICS_PART_ID = "metrics";

/**
 * The longest one model call may run before it is aborted and the answer is
 * written as a failure.
 *
 * This is not a guess at how slow a model is allowed to be, it is the ceiling
 * the arena's stale-claim recovery is built on: `STALE_CLAIM_MS` in
 * `features/arena/queries.ts` sits above this with room to spare, so a claim can
 * only ever be taken over from a call that is genuinely gone, never from one
 * that is still producing tokens. Raising this without raising that would let a
 * second request evict a live stream and throw its result away.
 */
export const MODEL_CALL_TIMEOUT_MS = 2 * 60 * 1000;
