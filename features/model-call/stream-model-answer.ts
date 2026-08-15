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

const describe = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

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
        onError: async ({ error }) => {
          onError(error);
          await onFail(describe(error));
        },
      });

      writer.merge(toUIMessageStream({ stream: result.stream, onError }));
    },
  });
};
