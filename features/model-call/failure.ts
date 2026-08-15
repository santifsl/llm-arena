/**
 * How a model call failed, reduced to the one distinction a person is treated
 * differently for. A rate limit is temporary and clears on its own, so the card
 * says to wait and the retry holds off for a moment; anything else is a hard
 * failure the person can retry at once.
 *
 * The raw provider reason is never any of this. It stays on the row for the log,
 * exactly as feature 3 decided; a person only ever reads one of the plain
 * sentences below.
 */
export type FailureKind = "rate-limited" | "failed";

/** The plain sentence a failed card shows, one per kind and never a raw reason. */
export const failureMessage = (kind: FailureKind): string =>
  kind === "rate-limited"
    ? "This model is busy right now. The other answers are unaffected."
    : "This model didn't answer. The other answers are unaffected.";

/**
 * The kind a settled lane recovers from the sentence the stream carried back.
 *
 * A stream that fails delivers one thing to the browser: the error part's text.
 * So that sentence doubles as the carrier for the kind, and this reads it back.
 * An unknown or missing one is treated as a hard failure, which is the safe
 * default.
 */
export const failureKindOf = (
  message: string | null | undefined,
): FailureKind =>
  message === failureMessage("rate-limited") ? "rate-limited" : "failed";

/**
 * How long the retry holds off after a rate limit, so a manual retry does not
 * fire straight back into the same 429. The AI SDK has already spent its own
 * attempts by the time the card goes red, so without this the only retry a
 * person could make is one that cannot succeed.
 */
export const RATE_LIMIT_COOLDOWN_SECONDS = 20;
