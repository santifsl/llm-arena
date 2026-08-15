import { captureAiGeneration } from "@posthog/ai";
import { PostHog } from "posthog-node";

import { publicEnv } from "@/env";
import type { CallMetrics } from "@/features/model-call/types";
import { processSingleton } from "@/singleton";

/**
 * The funnel, captured on the server rather than in the browser.
 *
 * A prompt being sent, an answer finishing, and a vote being cast are all
 * server facts: the first two are the only place the real numbers exist, and
 * the third is a transaction. Capturing them from the browser would mean
 * trusting the browser for the same reason the metrics are not client-reported,
 * and it would lose every event from a tab that closed mid-answer.
 *
 * `model_selected` is deliberately not here. Choosing a model in the picker
 * never reaches a server, so it is captured with `posthog-js` where it happens.
 *
 * The project key is the public one, which is the same key the browser uses;
 * PostHog has no separate server secret, and it is already validated at boot.
 */
const createClient = (): PostHog => {
  const { NEXT_PUBLIC_POSTHOG_KEY, NEXT_PUBLIC_POSTHOG_HOST } = publicEnv();

  return new PostHog(NEXT_PUBLIC_POSTHOG_KEY, {
    host: NEXT_PUBLIC_POSTHOG_HOST,
    // One event per request, sent as it happens. Batching is the right default
    // for a long-lived process and the wrong one here: a serverless instance
    // can be frozen the moment a response is returned, and a batched funnel
    // event would never leave.
    flushAt: 1,
    flushInterval: 0,
  });
};

export const analytics = processSingleton("posthog-node", createClient);

export type ArenaEvent =
  "prompt_submitted" | "answer_completed" | "answer_failed" | "vote_cast";

/**
 * Captures one event, and never lets analytics break the product. A funnel is
 * worth having and it is not worth failing a prompt for, so a capture that
 * throws is logged and swallowed.
 */
export const captureArenaEvent = (
  distinctId: string,
  event: ArenaEvent,
  properties: Readonly<Record<string, unknown>>,
): void => {
  try {
    analytics().capture({ distinctId, event, properties });
  } catch (error) {
    console.error("[arena] could not capture an analytics event", {
      event,
      error,
    });
  }
};

const SECONDS = 1000;

/**
 * One model call, as PostHog's LLM analytics wants to see it: `$ai_generation`
 * with the tokens, the cost, and the latency of the call itself.
 *
 * This is not the same thing as `answer_completed`. The funnel event says a
 * person got an answer; this one is about the call that produced it, and it is
 * what makes PostHog's LLM views work at all.
 *
 * The cost is passed explicitly rather than left to PostHog's own price list.
 * Every model here is free tier and genuinely reports $0.0000, and a price list
 * that has never heard of a `:free` variant would invent a number that is not
 * what we were charged.
 */
export const captureModelCall = async ({
  distinctId,
  answerId,
  modelId,
  input,
  output,
  metrics,
  error,
}: {
  readonly distinctId: string;
  readonly answerId: string;
  readonly modelId: string;
  readonly input: unknown;
  readonly output: unknown;
  readonly metrics?: CallMetrics;
  readonly error?: unknown;
}): Promise<void> => {
  try {
    await captureAiGeneration(analytics(), {
      distinctId,
      // One trace per answer row, so a retry reads as its own call rather than
      // an unexplained second generation on the first one.
      traceId: answerId,
      model: modelId,
      provider: "openrouter",
      input,
      output,
      latency: metrics === undefined ? undefined : metrics.durationMs / SECONDS,
      timeToFirstToken:
        metrics?.timeToFirstTokenMs == null
          ? undefined
          : metrics.timeToFirstTokenMs / SECONDS,
      usage: {
        inputTokens: metrics?.inputTokens ?? undefined,
        outputTokens: metrics?.outputTokens ?? undefined,
      },
      // OpenRouter reports one total for the call, and on the free tier it is
      // zero, so all of it sits on the output side.
      costOverride: { inputCost: 0, outputCost: metrics?.costUsd ?? 0 },
      properties: { answer_id: answerId },
      error,
    });
  } catch (failure) {
    console.error("[arena] could not capture a model call", {
      answerId,
      failure,
    });
  }
};
