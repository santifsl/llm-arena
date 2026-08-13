import arcjet, {
  detectBot,
  detectPromptInjection,
  shield,
  tokenBucket,
} from "@arcjet/next";

import { serverEnv } from "@/env";

/**
 * Arcjet sits in front of the arena's prompt endpoint, before any model is ever
 * called. Four rules, each doing a different job:
 *
 * - `shield` is the WAF baseline, SQLi and XSS and the rest of the OWASP top
 *   ten. Free and zero config, so it is always on.
 * - `detectBot` keeps the endpoint to real browsers. Nothing legitimate calls
 *   this route from a script.
 * - `tokenBucket` is the budget, and it is keyed on the signed-in user rather
 *   than the endpoint or the IP. This is the rule the whole transport design
 *   depends on: the browser fires one request per selected model, so three
 *   models means three calls for a single prompt. A per-endpoint limit would
 *   quietly let one person spend three times their share. Keying on `userId`
 *   means all three draw from one person's bucket.
 * - `detectPromptInjection` reads the actual prompt text and catches attempts
 *   to jailbreak or override the models' instructions.
 *
 * Note that `shield` and `detectPromptInjection` are two different things. The
 * first protects this app from malicious requests, the second protects the
 * models from malicious prompts. The arena needs both.
 */

/**
 * The budget is written in prompts, because that is the unit a person actually
 * thinks in, then converted to requests. Change these numbers, not the derived
 * ones below.
 */
const MODELS_PER_PROMPT = 3;
const BURST_PROMPTS = 10;
const PROMPTS_PER_HOUR = 5;

const createArenaClient = () =>
  arcjet({
    key: serverEnv().ARCJET_KEY,
    rules: [
      shield({ mode: "LIVE" }),
      // No safelist: every real caller here is a signed-in person in a browser.
      detectBot({ mode: "LIVE", allow: [] }),
      tokenBucket({
        mode: "LIVE",
        characteristics: ["userId"],
        capacity: BURST_PROMPTS * MODELS_PER_PROMPT,
        refillRate: PROMPTS_PER_HOUR * MODELS_PER_PROMPT,
        interval: "1h",
      }),
      detectPromptInjection({ mode: "LIVE" }),
    ],
  });

/**
 * Built on first use and shared, for the same reasons the database client is:
 * `next build` must not need a real key, and a fresh client per request would
 * throw away Arcjet's local caching of decisions.
 */
const clientCache = globalThis as unknown as {
  arenaArcjet: ReturnType<typeof createArenaClient> | undefined;
};

const arenaClient = () => (clientCache.arenaArcjet ??= createArenaClient());

/**
 * What the route should send back when a request is refused. A status and a
 * sentence a person can actually act on, never a rule name or a provider
 * string.
 */
export type ArenaDenial = Readonly<{
  status: number;
  message: string;
  retryAfterSeconds?: number;
}>;

const secondsUntil = (resetTime: Date | undefined, now: Date): number | undefined => {
  if (!resetTime) return undefined;

  const seconds = Math.ceil((resetTime.getTime() - now.getTime()) / 1000);

  return seconds > 0 ? seconds : undefined;
};

/**
 * "in about 4 minutes" reads better than "in 214 seconds", and rounding up
 * never promises a retry sooner than the bucket actually allows.
 */
const describeWait = (seconds: number | undefined): string => {
  if (seconds === undefined) return "in a little while";
  if (seconds < 90) return `in about ${Math.max(seconds, 1)} seconds`;

  return `in about ${Math.ceil(seconds / 60)} minutes`;
};

const rateLimitDenial = (retryAfterSeconds: number | undefined): ArenaDenial => ({
  status: 429,
  message: `You have sent a lot of prompts in a short time. Try again ${describeWait(
    retryAfterSeconds,
  )}.`,
  retryAfterSeconds,
});

const PROMPT_INJECTION_DENIAL: ArenaDenial = {
  status: 400,
  message:
    "That prompt looked like an attempt to override the models' own instructions, so it was not sent. Reword it and try again.",
};

const BOT_DENIAL: ArenaDenial = {
  status: 403,
  message:
    "The arena could not confirm this request came from a browser. Reload the page and try again.",
};

const BLOCKED_DENIAL: ArenaDenial = {
  status: 403,
  message: "That request was blocked for security reasons. Reload the page and try again.",
};

/**
 * Runs every rule once and returns either a denial to send back, or `null` when
 * the request is free to reach the models.
 *
 * If Arcjet itself is unreachable this fails open. A signed-in person losing
 * the ability to use the product because a security service is having an outage
 * is the worse failure of the two, and shield still ran locally.
 */
export const protectArenaStream = async (
  request: Request,
  context: Readonly<{ userId: string; prompt: string }>,
): Promise<ArenaDenial | null> => {
  const decision = await arenaClient().protect(request, {
    userId: context.userId,
    requested: 1,
    detectPromptInjectionMessage: context.prompt,
  });

  if (!decision.isDenied()) return null;

  if (decision.reason.isRateLimit()) {
    return rateLimitDenial(secondsUntil(decision.reason.resetTime, new Date()));
  }

  if (decision.reason.isPromptInjection()) return PROMPT_INJECTION_DENIAL;
  if (decision.reason.isBot()) return BOT_DENIAL;

  return BLOCKED_DENIAL;
};
