"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, isTextUIPart, type UIMessage } from "ai";
import { useEffect, useMemo, useRef } from "react";

import { AnswerCard } from "@/features/arena/answer-card";
import type { AnswerView } from "@/features/arena/thread";
import type { ArenaUIMessage } from "@/features/model-call/types";
import type { ModelIdentity } from "@/features/models/catalog";

/**
 * One model's answer while it is still arriving.
 *
 * Each of these owns its own request, its own abort, and its own state. There
 * is no shared stream object and no lane can observe another, which is feature
 * 1's "one model failing never affects the others" carried all the way into the
 * component tree rather than promised in a comment.
 *
 * It streams the text and nothing else: the server writes the row and the
 * numbers. When the call settles, the finished answer is handed up once, and
 * the parent renders it as a stored answer from then on. That is why a stream
 * running at thirty tokens a second does not re-render the whole thread.
 *
 * The settle signal comes from the SDK's own finish callback, never from
 * reading `status`. `ready` means "not currently streaming", which is also true
 * before the first request has left, so treating it as "finished" hands the
 * parent an empty answer the instant the lane mounts and tears the stream down
 * before it starts. That was a real bug, not a hypothetical one.
 */

const textOf = (message: UIMessage | undefined): string =>
  message === undefined
    ? ""
    : message.parts
        .filter(isTextUIPart)
        .map((part) => part.text)
        .join("");

const metricsOf = (message: ArenaUIMessage | undefined) =>
  message?.parts.find((part) => part.type === "data-metrics")?.data ?? null;

/**
 * Why the call failed, when the server said. It arrives as a data part rather
 * than being guessed from the error text, so the sentence this card shows is
 * the same one a reload will show from the stored row.
 */
const failureOf = (message: ArenaUIMessage | undefined) =>
  message?.parts.find((part) => part.type === "data-failure")?.data.kind ??
  null;

export const LiveAnswer = ({
  answer,
  model,
  prompt,
  scaleMs,
  elapsedMs,
  onSettled,
}: {
  readonly answer: AnswerView;
  readonly model: ModelIdentity;
  /** Sent so the local message list reads sensibly; the wire carries only the
   * answer id, because the server owns the history. */
  readonly prompt: string;
  readonly scaleMs: number;
  readonly elapsedMs: number;
  readonly onSettled: (answerId: string, settled: AnswerView) => void;
}) => {
  const transport = useMemo(
    () =>
      new DefaultChatTransport<ArenaUIMessage>({
        api: "/api/arena/stream",
        prepareSendMessagesRequest: () => ({ body: { answerId: answer.id } }),
      }),
    [answer.id],
  );

  // The hand-up happens exactly once per lane, whichever way the call ends.
  const settled = useRef(false);

  const settle = (state: AnswerView["state"], message?: ArenaUIMessage) => {
    if (settled.current) return;
    settled.current = true;

    onSettled(answer.id, {
      ...answer,
      state,
      text: textOf(message),
      metrics: metricsOf(message),
      // `onError` is the transport-level path and carries no message, so there
      // is no data part to read and `provider` is the honest default: a request
      // that never reached the provider cannot be known to be a quota refusal.
      failure: state === "failed" ? (failureOf(message) ?? "provider") : null,
    });
  };

  const { messages, status, sendMessage } = useChat<ArenaUIMessage>({
    id: answer.id,
    transport,
    onFinish: ({ message, isAbort, isDisconnect, isError }) =>
      settle(
        isAbort || isDisconnect || isError ? "failed" : "complete",
        message,
      ),
    onError: () => settle("failed"),
  });

  const sent = useRef(false);

  useEffect(() => {
    if (sent.current) return;
    sent.current = true;

    void sendMessage({ text: prompt });
  }, [prompt, sendMessage]);

  const reply = messages.at(-1);
  const streamed = reply?.role === "assistant" ? reply : undefined;

  return (
    <AnswerCard
      answer={{
        ...answer,
        state: status === "error" ? "failed" : "streaming",
        text: textOf(streamed),
        metrics: metricsOf(streamed),
        failure:
          status === "error" ? (failureOf(streamed) ?? "provider") : null,
      }}
      model={model}
      scaleMs={scaleMs}
      elapsedMs={elapsedMs}
      // This lane is the one receiving the stream, which is what tells the card
      // apart from one showing a call running somewhere else.
      live
    />
  );
};
