import {
  APICallError,
  createUIMessageStream,
  RetryError,
  streamText,
  toUIMessageStream,
  type InferUIMessageChunk,
  type ModelMessage,
} from "ai";

import { failureMessage, type FailureKind } from "./failure";
import { toCallMetrics } from "./metrics";
import { arenaModel } from "./openrouter";
import {
  METRICS_PART_ID,
  type ArenaUIMessage,
  type CallMetrics,
} from "./types";

/**
 * A provider can fail in a hundred ugly ways and none of them are the reader's
 * problem. The real error is logged with the model that produced it and kept on
 * the row for whoever reads the log; the person gets one plain sentence, chosen
 * by whether the failure was a temporary rate limit or a hard one.
 */

/**
 * The honest reason, kept on the row and in analytics.
 *
 * A non-`Error` is serialized rather than coerced: `String({...})` is the
 * `[object Object]` that used to reach the row and destroy the one diagnostic
 * worth having. `JSON.stringify` keeps the provider's own fields; the fallbacks
 * cover a value it cannot serialize.
 */
const describe = (error: unknown): string => {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;

  try {
    const json = JSON.stringify(error);

    if (json !== undefined) return json;
  } catch {
    // A circular or otherwise unserializable value falls through to String.
  }

  return String(error);
};

const RATE_LIMIT_STATUS = 429;

/**
 * Was this a temporary upstream rate limit rather than a hard failure?
 *
 * A free-tier model returns 429 when it is busy, and the SDK wraps that in a
 * `RetryError` once it has spent its own attempts, so both shapes are unwrapped
 * here. The text check is the last resort for a provider that reports the limit
 * as a plain object or a bare message instead.
 */
const isRateLimited = (error: unknown): boolean => {
  if (RetryError.isInstance(error)) return error.errors.some(isRateLimited);
  if (APICallError.isInstance(error))
    return error.statusCode === RATE_LIMIT_STATUS;

  return /\b429\b|rate.?limit/i.test(describe(error));
};

const classify = (error: unknown): FailureKind =>
  isRateLimited(error) ? "rate-limited" : "failed";

type StreamOptions = {
  readonly modelId: string;
  /** This model's own conversation, rebuilt from the database by the caller. */
  readonly messages: readonly ModelMessage[];
  /** Called once the model call ends, with the text and the real numbers. */
  readonly onComplete: (text: string, metrics: CallMetrics) => Promise<void>;
  /** Called instead, with the reason, when the call never produced an answer. */
  readonly onFail: (reason: string) => Promise<void>;
};

const textOf = (content: ReadonlyArray<{ readonly type: string }>): string =>
  content
    .filter(
      (part): part is { type: "text"; text: string } => part.type === "text",
    )
    .map((part) => part.text)
    .join("");

/**
 * Streams one model's answer, and writes the result where it belongs.
 *
 * The persistence happens inside `onLanguageModelCallEnd`, which is the one
 * event carrying the finished content, the usage, and the SDK's own timings at
 * the same moment. That is what keeps the card, the row, and the analytics
 * event reading from a single measurement instead of three.
 */
export const streamModelAnswer = ({
  modelId,
  messages,
  onComplete,
  onFail,
}: StreamOptions): ReadableStream<InferUIMessageChunk<ArenaUIMessage>> => {
  const onError = (error: unknown): string => {
    console.error(`[arena] model call failed`, { modelId, error });

    // The sentence is also how the settled lane learns the kind: the error
    // part's text is the one thing a failed stream carries to the browser.
    return failureMessage(classify(error));
  };

  return createUIMessageStream<ArenaUIMessage>({
    onError,
    execute: async ({ writer }) => {
      const result = streamText({
        model: arenaModel(modelId),
        messages: [...messages],
        onLanguageModelCallEnd: async (event) => {
          const metrics = toCallMetrics(event);

          writer.write({
            type: "data-metrics",
            id: METRICS_PART_ID,
            data: metrics,
          });

          await onComplete(textOf(event.content), metrics);
        },
        // Persistence only. The log and the reader-facing sentence come from the
        // shared `onError` above, which the merged stream calls for this error.
        onError: async ({ error }) => {
          await onFail(describe(error));
        },
      });

      writer.merge(toUIMessageStream({ stream: result.stream, onError }));
    },
  });
};
