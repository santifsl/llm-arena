"use client";

// Clerk 7 replaced <SignedIn>/<SignedOut> with <Show>, which is a server
// component. This harness is a client component, so it asks the hook directly.
import { SignInButton, UserButton, useAuth } from "@clerk/nextjs";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, isTextUIPart } from "ai";
import { useState } from "react";

import type { ArenaUIMessage, CallMetrics } from "@/features/model-call/types";

const DEFAULT_MODEL_ID = "inclusionai/ling-3.0-tiny:free";

const readMetrics = (message: ArenaUIMessage): CallMetrics | null => {
  const part = message.parts.find(
    (candidate) => candidate.type === "data-metrics",
  );

  return part === undefined ? null : part.data;
};

const readText = (message: ArenaUIMessage): string =>
  message.parts
    .filter(isTextUIPart)
    .map((part) => part.text)
    .join("");

const show = (value: number | null, unit: string): string =>
  value === null ? "not reported" : `${value} ${unit}`;

/**
 * The route refuses requests with a JSON body carrying a sentence already
 * written for a person, so surface that rather than a generic fallback. Anything
 * that is not one of our own sentences never reaches the screen.
 */
const readRefusal = (error: Error | undefined): string => {
  const fallback = "Something went wrong reaching that model.";

  if (error === undefined) return fallback;

  try {
    const parsed: unknown = JSON.parse(error.message);

    return typeof parsed === "object" &&
      parsed !== null &&
      "error" in parsed &&
      typeof parsed.error === "string"
      ? parsed.error
      : fallback;
  } catch {
    return fallback;
  }
};

/**
 * A throwaway harness for feature 1, not a screen. It makes no design choices
 * on purpose: the real look is decided in the design feature and the arena is
 * built in slice 1. This exists only to prove a prompt reaches a model, streams
 * back, and carries its real numbers with it.
 */
export function ProofClient() {
  const { isSignedIn } = useAuth();
  const [modelId, setModelId] = useState(DEFAULT_MODEL_ID);
  const [prompt, setPrompt] = useState("In one sentence, what is a token?");

  const { messages, sendMessage, status, error, stop, clearError } =
    useChat<ArenaUIMessage>({
      transport: new DefaultChatTransport({
        api: "/api/arena/stream",
        body: () => ({ modelId }),
      }),
    });

  const isBusy = status === "submitted" || status === "streaming";

  return (
    <main>
      <h1>Feature 1 proof harness</h1>

      {/* The stream route refuses anyone signed out, because Arcjet's budget is
          charged per person and an anonymous caller has no bucket. So the
          harness needs a way in before it can prove anything. */}
      <p>
        {isSignedIn ? (
          <UserButton />
        ) : (
          <>
            <SignInButton mode="modal" />
            {" — sign in first, the arena refuses signed-out prompts."}
          </>
        )}
      </p>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (isBusy || prompt.trim() === "") return;
          void sendMessage({ text: prompt });
        }}
      >
        <p>
          <label htmlFor="modelId">OpenRouter model id</label>
          <br />
          <input
            id="modelId"
            name="modelId"
            value={modelId}
            size={48}
            onChange={(event) => setModelId(event.target.value)}
          />
        </p>

        <p>
          <label htmlFor="prompt">Prompt</label>
          <br />
          <textarea
            id="prompt"
            name="prompt"
            rows={3}
            cols={60}
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
          />
        </p>

        <p>
          <button type="submit" disabled={isBusy}>
            Send
          </button>{" "}
          <button type="button" onClick={() => stop()} disabled={!isBusy}>
            Stop
          </button>{" "}
          <span aria-live="polite">status: {status}</span>
        </p>
      </form>

      {error !== undefined && (
        <p role="alert">
          {readRefusal(error)}{" "}
          <button type="button" onClick={() => clearError()}>
            Dismiss and retry
          </button>
        </p>
      )}

      <ol>
        {messages.map((message) => {
          const metrics = readMetrics(message);

          return (
            <li key={message.id}>
              <h2>{message.role}</h2>
              <p style={{ whiteSpace: "pre-wrap" }}>{readText(message)}</p>
              {metrics !== null && (
                <dl>
                  <dt>time to first token</dt>
                  <dd>{show(metrics.timeToFirstTokenMs, "ms")}</dd>
                  <dt>tokens per second</dt>
                  <dd>{show(metrics.tokensPerSecond, "tok/s")}</dd>
                  <dt>tokens in / out / total</dt>
                  <dd>
                    {show(metrics.inputTokens, "in")},{" "}
                    {show(metrics.outputTokens, "out")},{" "}
                    {show(metrics.totalTokens, "total")}
                  </dd>
                  <dt>duration</dt>
                  <dd>{metrics.durationMs} ms</dd>
                  <dt>cost</dt>
                  <dd>${metrics.costUsd.toFixed(4)}</dd>
                </dl>
              )}
            </li>
          );
        })}
      </ol>
    </main>
  );
}
