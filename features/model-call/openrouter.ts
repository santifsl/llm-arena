import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import type { LanguageModel } from "ai";

import { serverEnv } from "@/env";

/**
 * Every model call in this app goes through here. `usage.include` is what makes
 * OpenRouter return real token counts and real spend for the call, which the
 * response card, the leaderboard, and PostHog all depend on.
 *
 * PostHog's LLM analytics is fed from the route rather than by wrapping this
 * model. `@posthog/ai`'s Vercel wrapper only accepts a v2 or v3 language model
 * and the OpenRouter provider is already on v4, so wrapping it would mean
 * casting a shape that does not match. Its own `captureAiGeneration` primitive
 * is documented for exactly this case, and it takes the numbers `toCallMetrics`
 * has already measured, which keeps one measurement behind the card, the row,
 * and the analytics event instead of adding a second source.
 */
export const arenaModel = (modelId: string): LanguageModel =>
  createOpenRouter({
    apiKey: serverEnv().OPENROUTER_API_KEY,
    compatibility: "strict",
    appName: "LLM Arena",
  }).chat(modelId, { usage: { include: true } });
