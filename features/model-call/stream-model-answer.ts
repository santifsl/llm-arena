import {
  convertToModelMessages,
  createUIMessageStream,
  streamText,
  toUIMessageStream,
  type InferUIMessageChunk,
} from "ai";

import { toCallMetrics } from "./metrics";
import { arenaModel } from "./openrouter";
import type { StreamRequest } from "./request";
import { METRICS_PART_ID, type ArenaUIMessage } from "./types";

/**
 * A provider can fail in a hundred ugly ways and none of them are the reader's
 * problem. The real error is logged with the model that produced it; the person
 * gets one plain sentence and a retry.
 *
 * The sentence ships as the same JSON `{ error }` shape the route returns for
 * 401, 400, and 429. The client reads every refusal as that shape, so a bare
 * sentence here would fail its parse and get replaced by a generic fallback,
 * hiding the one message written for the reader.
 */
const toReaderFacingMessage = (modelId: string) => (error: unknown): string => {
  console.error(`[arena] model call failed`, { modelId, error });

  return JSON.stringify({
    error: "This model could not answer. Try again, or send the prompt without it.",
  });
};

/**
 * Streams one model's answer as a UI message stream, with the call's real
 * numbers appended as a typed data part once the model call ends.
 */
export const streamModelAnswer = ({
  modelId,
  messages,
}: StreamRequest): ReadableStream<InferUIMessageChunk<ArenaUIMessage>> => {
  const onError = toReaderFacingMessage(modelId);

  return createUIMessageStream<ArenaUIMessage>({
    onError,
    execute: async ({ writer }) => {
      const result = streamText({
        model: arenaModel(modelId),
        messages: await convertToModelMessages<ArenaUIMessage>(messages),
        onLanguageModelCallEnd: ({ usage, performance, providerMetadata }) => {
          writer.write({
            type: "data-metrics",
            id: METRICS_PART_ID,
            data: toCallMetrics({ usage, performance, providerMetadata }),
          });
        },
      });

      writer.merge(toUIMessageStream({ stream: result.stream, onError }));
    },
  });
};
