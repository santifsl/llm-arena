import arcjet, {
  detectBot,
  detectPromptInjection,
  request as currentRequest,
  shield,
  slidingWindow,
  tokenBucket,
  type ArcjetNextRequest,
} from "@arcjet/next";

import { serverEnv } from "@/env";
import { errorLog } from "@/lib/errors";
import { processSingleton } from "@/singleton";

/**
 * Arcjet guards the arena in three places, because the arena has three entry
 * points and they carry different risk.
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
 * Reading a shared thread is the third, and it is the only one a stranger can
 * reach. There is no account to charge and no ownership to check, so the only
 * thing left to bound is how often one address may ask, and the answer has to
 * leave room for the traffic sharing actually creates: link unfurlers, and a
 * roomful of people opening the same link from one office address.
 *
 * The rules themselves:
 *
 * - `shield` is the WAF baseline, SQLi and XSS and the rest of the OWASP top
 *   ten. Free and zero config, so it is on at all three entry points.
 * - `detectBot` keeps the two signed-in entry points to real browsers. Nothing
 *   legitimate scripts either. The public read is the deliberate exception:
 *   see `THREAD_READERS` below.
 * - `tokenBucket` is the budget, keyed on the signed-in user rather than the
 *   endpoint or the IP, so a person has one allowance wherever they spend it.
 * - `slidingWindow` bounds the public read, keyed on the source address,
 *   because a visitor has no id to key on.
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
 * Who is allowed to be a bot on a shared thread.
 *
 * Every other entry point runs `allow: []`, because nothing legitimate scripts
 * the arena. A shared link is the opposite case: the whole point of feature 8
 * is that the URL gets pasted somewhere, and the first thing every one of those
 * somewheres does is fetch the page to build a preview card. Denying those does
 * not stop abuse, it just makes shared links render as bare URLs, which is the
 * feature failing quietly.
 *
 * `SEARCH_ENGINE` is the one that is a product decision rather than a technical
 * one, and it is deliberate: shared threads are meant to be findable. If that
 * ever stops being true, this line is where it changes, not a robots file.
 */
const THREAD_READERS = [
  "CATEGORY:SEARCH_ENGINE",
  "CATEGORY:PREVIEW",
  "CATEGORY:SOCIAL",
  "CATEGORY:SLACK",
] as const;

/**
 * How many reads one address gets a minute.
 *
 * Deliberately far above any human and far below any loop. A person reading a
 * thread and reloading to watch a race finish spends a handful; an office
 * where fifty people open the same link at once, all sharing one outbound
 * address, spends well under this; a script hitting the page in a loop spends
 * it in under a second. Anything between those is not a case worth optimising
 * for, and the cost of guessing high is one extra database read.
 */
const READS_PER_MINUTE = 120;

/**
 * Reading a shared thread. The WAF, a bot rule that lets link previews and
 * search engines through, and a limit on how fast one address may ask.
 *
 * There is no token bucket here on purpose. A bucket refills slowly and is
 * meant to price a scarce thing, which is right for prompts and wrong for
 * reads: a visitor who reloads a few times and then hits a ten-minute wall
 * would be a bug. A sliding window forgets, which is what a read wants.
 */
const createThreadClient = () =>
  arcjet({
    key: serverEnv().ARCJET_KEY,
    rules: [
      shield({ mode: "LIVE" }),
      detectBot({ mode: "LIVE", allow: [...THREAD_READERS] }),
      slidingWindow({
        mode: "LIVE",
        characteristics: ["ip.src"],
        interval: "1m",
        max: READS_PER_MINUTE,
      }),
    ],
  });

/**
 * Built on first use and shared, for the same reasons the database client is:
 * `next build` must not need a real key, and a fresh client per request would
 * throw away Arcjet's local caching of decisions.
 */
const submitClient = processSingleton("arcjet-submit", createSubmitClient);
const streamClient = processSingleton("arcjet-stream", createStreamClient);
const threadClient = processSingleton("arcjet-thread", createThreadClient);

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

/**
 * The two rate limits mean different things to the person who hits them, so
 * they say different things. Somebody who has spent their prompt budget did
 * send a lot of prompts; somebody reading a link they were sent has sent
 * nothing at all, and telling them otherwise would be both wrong and confusing.
 */
const promptBudgetDenial = (
  retryAfterSeconds: number | undefined,
): ArenaDenial => ({
  status: 429,
  message: `You have sent a lot of prompts in a short time. Try again ${describeWait(
    retryAfterSeconds,
  )}.`,
  retryAfterSeconds,
});

const threadReadDenial = (
  retryAfterSeconds: number | undefined,
): ArenaDenial => ({
  status: 429,
  message: `This thread is being opened very quickly from your network, so it wasn't loaded. Try again ${describeWait(
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
    isErrored: () => boolean;
    reason: {
      isRateLimit: () => boolean;
      isPromptInjection: () => boolean;
      isBot: () => boolean;
      resetTime?: Date;
    };
  }>,
  rateLimitDenial: (retryAfterSeconds: number | undefined) => ArenaDenial,
): Promise<ArenaDenial | null> => {
  const decision = await run().catch((error: unknown) => {
    console.error(
      `[arena] arcjet could not reach a decision: ${errorLog(error)}`,
    );

    return null;
  });

  // Failing open is the right behaviour and a silent one is not. An `ERROR`
  // decision means no rule actually ran, so every request is being allowed
  // through unprotected, and the causes are all configuration rather than
  // weather: a deployment that does not hand Arcjet a client address makes
  // every IP-keyed rule fail this way, which is a rate limit that silently
  // limits nothing. Loud in the log, still allowed through to the person.
  if (decision?.isErrored()) {
    console.error(
      "[arena] arcjet reached no decision and the request was allowed through unprotected",
    );
  }

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
  decide(
    async () =>
      submitClient().protect(await currentRequest(), {
        userId: context.userId,
        requested: 1,
        detectPromptInjectionMessage: context.prompt,
      }),
    promptBudgetDenial,
  );

/**
 * Streaming one answer: the WAF and bot detection. No budget is charged here,
 * because the prompt that caused these requests was already charged once, and
 * no prompt text arrives here to screen.
 */
export const protectArenaStream = async (
  request: ArcjetNextRequest,
): Promise<ArenaDenial | null> =>
  decide(async () => streamClient().protect(request), promptBudgetDenial);

/**
 * Reading a shared thread. Called from a page rather than a route handler,
 * which is why it takes no request: like the submit action, a server render has
 * no `Request` object of its own, so Arcjet rebuilds one from the headers.
 *
 * Feature 8 recorded that no rule guarded this page, on the grounds that the
 * exposure did not warrant one. That reasoning was about what a stranger can
 * *see*, and it still holds: one row by primary key, an unguessable id, nothing
 * leaked. It said nothing about how *often* a stranger can ask, and that is the
 * gap this closes. The page is dynamic, so every request is a real render and a
 * real query; unbounded, one shared link is an open invitation to spend our
 * database on somebody's loop.
 *
 * The caller is expected to run this before reading the thread, so that a
 * refused request costs a decision and not a query.
 */
export const protectSharedThread = async (): Promise<ArenaDenial | null> =>
  decide(
    async () => threadClient().protect(await currentRequest()),
    threadReadDenial,
  );
