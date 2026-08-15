import {
  createUIMessageStream,
  streamText,
  toUIMessageStream,
  type InferUIMessageChunk,
  type ModelMessage,
} from "ai";

import { toCallMetrics } from "./metrics";
import { arenaModel } from "./openrouter";
import {
  METRICS_PART_ID,
  MODEL_CALL_TIMEOUT_MS,
  type ArenaUIMessage,
  type CallMetrics,
} from "./types";

/**
 * A provider can fail in a hundred ugly ways and none of them are the reader's
 * problem. The real error is logged with the model that produced it and kept on
 * the row for whoever reads the log; the person gets one plain sentence.
 */
const READER_FACING_FAILURE =
  "This model could not answer. Try again, or send the prompt without it.";

/**
 * The reason kept for the log and the row. `String(error)` alone turned a
 * provider's error object into the literal text `[object Object]`, which was
 * observed on a real failed call and tells whoever reads the log nothing.
 */
const describe = (error: unknown): string => {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;

  try {
    return JSON.stringify(error) ?? String(error);
  } catch {
    return String(error);
  }
};

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

    return READER_FACING_FAILURE;
  };

  return createUIMessageStream<ArenaUIMessage>({
    onError,
    execute: async ({ writer }) => {
      // One call ends once, and the SDK does not guarantee that. On an abort it
      // fires `onAbort` and `onLanguageModelCallEnd` about two milliseconds
      // apart, both of them carrying a terminal write, and the claim in the
      // database only makes the second write a no-op rather than deciding which
      // one that is. Measured against the real provider, the complete write won
      // one run in five and stored a sentence the model was cut off in the
      // middle of as a finished answer, with metrics that looked real. A
      // truncated answer presented as complete is worse than a failed one: it
      // is votable, and it reaches the leaderboard.
      //
      // So the decision is made here, in the process that knows, and the
      // database's claim goes back to being what it was built for, which is the
      // other process. First ending wins; the rest are dropped. `LiveAnswer`
      // guards its hand-up the same way and for the same reason.
      let settled = false;

      const settle = async (write: () => Promise<void>): Promise<boolean> => {
        if (settled) return false;
        settled = true;

        await write();

        return true;
      };

      const result = streamText({
        model: arenaModel(modelId),
        messages: [...messages],
        // A model that never finishes has to end somewhere, and the arena needs
        // it to end at a time it knows. Without this the row would sit
        // `STREAMING` for as long as the process lived, and once that passed the
        // stale-claim window another request could take the claim over while the
        // first call was still producing tokens, spend a second provider call,
        // and discard the first one's answer. The abort makes that impossible:
        // the call is over, and written as a failure, long before its claim is
        // old enough for anyone else to take.
        abortSignal: AbortSignal.timeout(MODEL_CALL_TIMEOUT_MS),
        // An abort is not an error to the SDK, so `onError` never sees it. This
        // is what turns the timeout into a real failed row with its claim
        // released, rather than a row left streaming for the recovery path.
        onAbort: async () => {
          const reason = `model call exceeded ${MODEL_CALL_TIMEOUT_MS}ms`;

          console.error("[arena] model call timed out", { modelId });

          await settle(() => onFail(reason));
        },
        onLanguageModelCallEnd: async (event) => {
          const metrics = toCallMetrics(event);

          // The part is written only if this ending is the one that counts, so
          // a card cannot show numbers for a call that was recorded as failed.
          if (await settle(() => onComplete(textOf(event.content), metrics))) {
            writer.write({
              type: "data-metrics",
              id: METRICS_PART_ID,
              data: metrics,
            });
          }
        },
        onError: async ({ error }) => {
          onError(error);
          await settle(() => onFail(describe(error)));
        },
      });

      writer.merge(toUIMessageStream({ stream: result.stream, onError }));
    },
  });
};
