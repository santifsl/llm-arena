import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import type { LanguageModel } from "ai";

import { serverEnv } from "@/env";

/**
 * Every model call in this app goes through here. `usage.include` is what makes
 * OpenRouter return real token counts and real spend for the call, which the
 * response card, the leaderboard, and PostHog all depend on.
 */
export const arenaModel = (modelId: string): LanguageModel =>
  createOpenRouter({
    apiKey: serverEnv().OPENROUTER_API_KEY,
    compatibility: "strict",
    appName: "LLM Arena",
  }).chat(modelId, { usage: { include: true } });
