import arcjet, {
  detectBot,
  detectPromptInjection,
  request as currentRequest,
  shield,
  tokenBucket,
  type ArcjetNextRequest,
} from "@arcjet/next";

import { serverEnv } from "@/env";
import { processSingleton } from "@/singleton";

/**
 * Arcjet guards the arena in two places, because the arena has two entry points
 * and they carry different risk.
 *
 * Sending a prompt is the expensive act, and it happens once per prompt in a
 * server action. That is where the budget and the prompt-injection check
 * belong: the action is the only place that knows a prompt happened, and it is
 * the only place the prompt text arrives.
 *
 * Streaming one answer is the cheap act, and it happens once per selected
 * model against a row that already exists. It keeps the WAF and bot detection,
 * and its real gate is ownership: the row has to belong to a thread the caller
 * owns, which the query enforces. That is stronger than a rate limit, because
 * it makes streaming into somebody else's thread impossible rather than merely
 * expensive.
 *
 * The rules themselves:
 *
 * - `shield` is the WAF baseline, SQLi and XSS and the rest of the OWASP top
 *   ten. Free and zero config, so it is on at both entry points.
 * - `detectBot` keeps both to real browsers. Nothing legitimate scripts either.
 * - `tokenBucket` is the budget, keyed on the signed-in user rather than the
 *   endpoint or the IP, so a person has one allowance wherever they spend it.
 * - `detectPromptInjection` reads the actual prompt text and catches attempts
 *   to jailbreak or override the models' instructions.
 *
 * Note that `shield` and `detectPromptInjection` are two different things. The
 * first protects this app from malicious requests, the second protects the
 * models from malicious prompts. The arena needs both.
 */

/**
 * The budget, in prompts, which is the unit a person actually thinks in. It no
 * longer needs converting: when this lived on the stream route one prompt cost
 * three requests, so every number had to be multiplied by the model count. The
 * action is charged once per prompt, so the numbers now mean what they say.
 */
const BURST_PROMPTS = 10;
const PROMPTS_PER_HOUR = 5;

// No safelist anywhere here: every real caller is a signed-in person in a
// browser, and nothing legitimate scripts the arena.
const baseRules = [
  shield({ mode: "LIVE" }),
  detectBot({ mode: "LIVE", allow: [] }),
];

const createSubmitClient = () =>
  arcjet({
    key: serverEnv().ARCJET_KEY,
    rules: [
      ...baseRules,
      tokenBucket({
        mode: "LIVE",
        characteristics: ["userId"],
        capacity: BURST_PROMPTS,
        refillRate: PROMPTS_PER_HOUR,
        interval: "1h",
      }),
      detectPromptInjection({ mode: "LIVE" }),
    ],
  });

const createStreamClient = () =>
  arcjet({ key: serverEnv().ARCJET_KEY, rules: baseRules });

/**
 * Built on first use and shared, for the same reasons the database client is:
 * `next build` must not need a real key, and a fresh client per request would
 * throw away Arcjet's local caching of decisions.
 */
const submitClient = processSingleton("arcjet-submit", createSubmitClient);
const streamClient = processSingleton("arcjet-stream", createStreamClient);

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

const secondsUntil = (
  resetTime: Date | undefined,
  now: Date,
): number | undefined => {
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

const rateLimitDenial = (
  retryAfterSeconds: number | undefined,
): ArenaDenial => ({
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
  message:
    "That request was blocked for security reasons. Reload the page and try again.",
};

/**
 * Runs every rule once and returns either a denial to send back, or `null` when
 * the request is free to reach the models.
 *
 * If Arcjet itself is unreachable this fails open. A signed-in person losing
 * the ability to use the product because a security service is having an outage
 * is the worse failure of the two, and shield still ran locally.
 *
 * The SDK already turns transport and service failures into an `ERROR`
 * decision rather than throwing, and an `ERROR` decision is not a denial, so
 * that path fails open on its own. The `catch` is here so the guarantee is a
 * property of this function rather than an implementation detail of a
 * dependency: if a future version throws, or the local analysis dies, people
 * keep their product.
 *
 * Note what is deliberately left outside it. Building the client reads the
 * environment and validates the rule options, so it throws when the app is
 * misconfigured, not when Arcjet is down, and that has to stay loud. Silently
 * allowing every request because a key is missing would turn a broken deploy
 * into an unprotected one, which is the failure this module exists to prevent.
 */
const decide = async (
  run: () => Promise<{
    isDenied: () => boolean;
    reason: {
      isRateLimit: () => boolean;
      isPromptInjection: () => boolean;
      isBot: () => boolean;
      resetTime?: Date;
    };
  }>,
): Promise<ArenaDenial | null> => {
  const decision = await run().catch((error: unknown) => {
    console.error("[arena] arcjet could not reach a decision", { error });

    return null;
  });

  if (!decision || !decision.isDenied()) return null;

  if (decision.reason.isRateLimit()) {
    return rateLimitDenial(secondsUntil(decision.reason.resetTime, new Date()));
  }

  if (decision.reason.isPromptInjection()) return PROMPT_INJECTION_DENIAL;
  if (decision.reason.isBot()) return BOT_DENIAL;

  return BLOCKED_DENIAL;
};

/**
 * Sending a prompt: every rule, and the one place the budget is charged. Called
 * from a server action, which has no `Request` object of its own, so Arcjet
 * rebuilds one from the current request's headers.
 */
export const protectPromptSubmission = async (
  context: Readonly<{ userId: string; prompt: string }>,
): Promise<ArenaDenial | null> =>
  decide(async () =>
    submitClient().protect(await currentRequest(), {
      userId: context.userId,
      requested: 1,
      detectPromptInjectionMessage: context.prompt,
    }),
  );

/**
 * Streaming one answer: the WAF and bot detection. No budget is charged here,
 * because the prompt that caused these requests was already charged once, and
 * no prompt text arrives here to screen.
 */
export const protectArenaStream = async (
  request: ArcjetNextRequest,
): Promise<ArenaDenial | null> =>
  decide(async () => streamClient().protect(request));
