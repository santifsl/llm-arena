/**
 * Which models this app is willing to call.
 *
 * This is a spending control, not a formatting nicety. The stream route calls
 * OpenRouter with the application's own key, so whatever model id survives
 * validation is billed to us. Without a server-side check, any signed-in person
 * could post `openai/gpt-4o` and spend real money through the arena. The rule
 * that the whole product rests on, every model here is free tier, has to be
 * enforced on the server or it is not enforced at all.
 *
 * OpenRouter encodes the free tier in the id itself: a `:free` variant is the
 * zero-cost one. Checked against their live catalog, all 15 `:free` models
 * price at zero and no paid model carries the suffix, so the suffix is a sound
 * test for "this call cannot cost anything".
 *
 * It is deliberately conservative. A handful of zero-cost models do not use the
 * suffix and are refused here; refusing a free model is a much cheaper mistake
 * than accepting a paid one. Feature 5 replaces this with the live free-tier
 * catalog it already has to fetch for the picker, and this becomes the fallback
 * rather than the only gate.
 */
const FREE_TIER_MODEL_ID = /^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+:free$/;

export const isFreeTierModelId = (modelId: string): boolean =>
  FREE_TIER_MODEL_ID.test(modelId);
