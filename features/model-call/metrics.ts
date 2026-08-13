import type { LanguageModelUsage, ProviderMetadata } from "ai";
import { z } from "zod";

import type { CallMetrics } from "./types";

/**
 * The slice of the AI SDK's model-call performance object this app actually
 * uses. Declared structurally so `toCallMetrics` stays a pure function over
 * plain data instead of depending on the whole callback event.
 */
export type CallPerformance = {
  readonly responseTimeMs: number;
  readonly timeToFirstOutputMs: number | undefined;
  readonly outputTokensPerSecond: number | undefined;
  readonly effectiveOutputTokensPerSecond: number;
};

export type CallOutcome = {
  readonly usage: LanguageModelUsage;
  readonly performance: CallPerformance;
  readonly providerMetadata?: ProviderMetadata;
};

/**
 * OpenRouter reports real spend under its own provider metadata when usage
 * accounting is enabled. Parsed rather than cast, so an unexpected shape
 * degrades to $0.0000 instead of throwing or lying.
 */
const openRouterUsageSchema = z.object({ cost: z.number().nonnegative().optional() });

const readCostUsd = (providerMetadata: ProviderMetadata | undefined): number => {
  const parsed = openRouterUsageSchema.safeParse(providerMetadata?.openrouter?.usage);

  return parsed.success ? (parsed.data.cost ?? 0) : 0;
};

const orNull = (value: number | undefined): number | null => value ?? null;

/** Rounds to one decimal so the UI never renders a fifteen-digit float. */
const round = (value: number): number => Math.round(value * 10) / 10;

export const toCallMetrics = ({
  usage,
  performance,
  providerMetadata,
}: CallOutcome): CallMetrics => {
  // The rate after the first token is what a person perceives as typing speed.
  // The effective rate over the whole call is the fallback for non-streaming.
  const perSecond = performance.outputTokensPerSecond ?? performance.effectiveOutputTokensPerSecond;

  return {
    timeToFirstTokenMs:
      performance.timeToFirstOutputMs === undefined
        ? null
        : Math.round(performance.timeToFirstOutputMs),
    tokensPerSecond: Number.isFinite(perSecond) ? round(perSecond) : null,
    inputTokens: orNull(usage.inputTokens),
    outputTokens: orNull(usage.outputTokens),
    totalTokens: orNull(usage.totalTokens),
    durationMs: Math.round(performance.responseTimeMs),
    costUsd: readCostUsd(providerMetadata),
  };
};
