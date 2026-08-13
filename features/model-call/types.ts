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
