/**
 * Turning a thrown value into something a person reading the server log can
 * act on.
 *
 * This exists because the log was unreadable, and the reason it was unreadable
 * is worth stating exactly, because the obvious explanation is wrong. Every
 * catch site was written as `console.error("...", { error })`, and the first
 * guess was that an `Error`'s `name`, `message`, and `stack` are non-enumerable
 * so the object serialised empty. That is true and it is not the cause: the
 * model-call site logged `{ modelId, error }`, where `modelId` is a plain
 * string, and it still wrote `{}`. Counted across the whole dev log, 77 of 83
 * lines carrying a second argument rendered as `{}`; the only ones that
 * survived were errors Next surfaced itself.
 *
 * Next's development log writer discards the second `console.error` argument.
 * So the detail has to be part of the message string, and every caller
 * interpolates rather than passing an object. That is uglier at the call site
 * and it is the only version that actually reaches a log file.
 *
 * It lives outside `features/` for the reason `docs/coding-standards.md` gives:
 * the test is the number of consumers, not the folder, and every feature that
 * can fail is a consumer of this.
 */

/** A Prisma error carries a code such as `P2028`, which is the useful part. */
const codeOf = (error: unknown): string | null =>
  typeof error === "object" &&
  error !== null &&
  "code" in error &&
  typeof (error as { readonly code?: unknown }).code === "string"
    ? (error as { readonly code: string }).code
    : null;

/**
 * Short and human-readable: what went wrong, with the provider's or the
 * database's own code when there is one.
 *
 * Safe to store as well as to log. `Answer.failureReason` holds one of these,
 * and it is never shown to a reader, so it can say as much as it likes.
 */
export const describeError = (error: unknown): string => {
  const code = codeOf(error);
  const prefix = code === null ? "" : `${code}: `;

  if (error instanceof Error) return `${prefix}${error.name}: ${error.message}`;
  if (typeof error === "string") return `${prefix}${error}`;

  try {
    return `${prefix}${JSON.stringify(error) ?? String(error)}`;
  } catch {
    // A circular or otherwise unserialisable value. `String` still says
    // something, and this must never be the thing that throws.
    return `${prefix}${String(error)}`;
  }
};

/**
 * The whole failure as one string, stack included, for interpolating into a log
 * message. Never passed as a second argument, for the reason above.
 */
export const errorLog = (error: unknown): string => {
  const stack = error instanceof Error ? error.stack : undefined;

  return stack === undefined
    ? describeError(error)
    : `${describeError(error)}\n${stack}`;
};
