"use client";

import { Check, ChevronDown, RotateCw, TriangleAlert } from "lucide-react";
import { useState } from "react";

import { ModelBadge } from "@/components/model-badge";
import { Trace } from "@/components/trace";
import { AnswerText } from "@/features/arena/answer-text";
import type { AnswerView } from "@/features/arena/thread";
import type { FailureKind } from "@/features/model-call/types";
import type { ModelIdentity } from "@/features/models/catalog";
import { cn } from "@/lib/utils";

type AnswerCardProps = {
  readonly answer: AnswerView;
  /**
   * Only what it takes to name the model. A thread outlives the catalog, and a
   * stored answer from a since-delisted model still has to render.
   */
  readonly model: ModelIdentity;
  /** The slowest answer in this turn, so every trace shares one scale. */
  readonly scaleMs: number;
  /** Time so far while streaming, total time once the call has ended. */
  readonly elapsedMs: number;
  /**
   * True only when this card is the one receiving the stream. A streaming
   * answer that is not live is a call running somewhere else, which is what a
   * visitor to a shared link sees while the owner's models are still working.
   */
  readonly live?: boolean;
  readonly isWinner?: boolean;
  /** A turn needs two answers before a vote means anything. */
  readonly canVote?: boolean;
  /** Absent when this answer cannot be the winner. */
  readonly onPick?: () => void;
  readonly onRetry?: () => void;
  readonly retrying?: boolean;
  /**
   * A reader who does not own this thread. The pick control is removed rather
   * than disabled: a disabled control is a promise that it could become usable,
   * and for a visitor it never can.
   */
  readonly readOnly?: boolean;
};

/**
 * What a failed card says, and the reason there is more than one sentence.
 *
 * The generic one used to be the only one, and it ended "The other answers are
 * unaffected", which is true of a model falling over on its own and false in
 * the one case that matters most. Every model here is free tier, OpenRouter
 * caps a free account at 50 model requests a day across all models, and when
 * that runs out all three cards fail at the same instant for the same reason.
 * Saying the others are unaffected there points a person at exactly the wrong
 * explanation, and a retry is the wrong thing for them to reach for.
 *
 * The quota sentence names the ceiling and when it lifts, because "try again"
 * is useless advice for something that only changes at midnight.
 */
const FAILURE_SENTENCE: Readonly<Record<FailureKind, string>> = {
  provider: "This model didn't answer. The other answers are unaffected.",
  quota:
    "The arena has used up its free model requests for today. Every model is affected, and the allowance resets at midnight UTC.",
};

const formatMs = (ms: number): string =>
  ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(2)} s`;

const EM_DASH = "—";

export const AnswerCard = ({
  answer,
  model,
  scaleMs,
  elapsedMs,
  live = false,
  isWinner = false,
  canVote = false,
  onPick,
  onRetry,
  retrying = false,
  readOnly = false,
}: AnswerCardProps) => {
  const [metricsOpen, setMetricsOpen] = useState(false);
  const failed = answer.state === "failed";
  /** Still running, but not into this card. Nothing here will fill it in. */
  const pending = answer.state === "streaming" && !live;
  const { metrics } = answer;

  return (
    <article
      className={cn(
        "flex min-w-0 flex-col rounded-sm border bg-surface",
        isWinner ? "border-win" : "border-rule",
      )}
    >
      <header className="flex items-center gap-2 border-b border-rule px-3 py-2.5">
        <ModelBadge initial={model.initial} />
        <h3 className="min-w-0 flex-1 truncate text-sm" title={model.name}>
          {model.name}
        </h3>

        {isWinner ? (
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-sm border border-win px-2 py-1 text-xs text-win">
            <Check className="size-3.5" aria-hidden />
            Winner
          </span>
        ) : readOnly ? null : (
          <button
            type="button"
            onClick={onPick}
            disabled={onPick === undefined || !canVote || failed}
            title={
              failed
                ? "This model didn't answer, so it can't win."
                : onPick === undefined
                  ? "This model has not finished answering yet."
                  : canVote
                    ? undefined
                    : "Two models have to answer before you can pick a winner."
            }
            className="shrink-0 rounded-sm border border-rule px-2 py-1 text-xs text-ink-dim hover:border-rust hover:text-ink disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-rule disabled:hover:text-ink-dim"
          >
            Pick this answer
          </button>
        )}
      </header>

      <div className="px-3">
        <Trace
          modelName={model.name}
          elapsedMs={elapsedMs}
          firstTokenMs={metrics?.timeToFirstTokenMs ?? null}
          scaleMs={scaleMs}
          state={
            answer.state === "complete"
              ? "done"
              : answer.state === "failed"
                ? "failed"
                : "streaming"
          }
        />
      </div>

      <div className="min-h-24 flex-1 px-3 pb-3">
        {failed ? (
          <div className="flex flex-col items-start gap-2 text-sm text-fail">
            <p className="flex items-start gap-2">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
              {FAILURE_SENTENCE[answer.failure ?? "provider"]}
            </p>
            {onRetry !== undefined && (
              <button
                type="button"
                onClick={onRetry}
                disabled={retrying}
                className="inline-flex items-center gap-1.5 rounded-sm border border-rule px-2 py-1 text-xs text-ink hover:border-rust disabled:opacity-40"
              >
                <RotateCw className="size-3.5" aria-hidden />
                {retrying ? "Starting" : "Try this model again"}
              </button>
            )}
          </div>
        ) : pending ? (
          // A call running in somebody else's browser. There is no live text to
          // show and nothing here will ever fill it in, so the page says so and
          // names the control that would: a reload. Polling somebody else's
          // stream would be a second live surface, and feature 8 deliberately
          // did not build one.
          <p className="text-sm text-ink-dim">
            This model is still answering. Reload the page to see how it ended.
          </p>
        ) : (
          // A div, not a paragraph: the answer is Markdown now, so it can
          // contain lists, headings, and code blocks, none of which are legal
          // inside a `<p>`. The empty paragraph is what gives the caret
          // somewhere to sit before the first token lands.
          <div
            className={cn(
              "answer-prose",
              answer.state === "streaming" && "is-streaming",
            )}
          >
            {answer.text === "" ? <p /> : <AnswerText text={answer.text} />}
          </div>
        )}
      </div>

      <footer className="border-t border-rule">
        <button
          type="button"
          onClick={() => setMetricsOpen((previous) => !previous)}
          aria-expanded={metricsOpen}
          className="eyebrow flex w-full items-center gap-1.5 px-3 py-2 hover:text-ink"
        >
          <ChevronDown
            className={cn(
              "size-3.5 transition-transform motion-reduce:transition-none",
              metricsOpen && "rotate-180",
            )}
            aria-hidden
          />
          Metrics
        </button>

        {metricsOpen && (
          <dl className="grid grid-cols-3 gap-2 px-3 pb-3">
            <div>
              <dt className="eyebrow">To first token</dt>
              <dd className="numeral text-sm">
                {metrics?.timeToFirstTokenMs == null
                  ? EM_DASH
                  : formatMs(metrics.timeToFirstTokenMs)}
              </dd>
            </div>
            <div>
              <dt className="eyebrow">Speed</dt>
              <dd className="numeral text-sm">
                {metrics?.tokensPerSecond == null
                  ? EM_DASH
                  : `${metrics.tokensPerSecond.toFixed(1)} tok/s`}
              </dd>
            </div>
            <div>
              <dt className="eyebrow">Tokens</dt>
              <dd className="numeral text-sm">
                {metrics?.totalTokens ?? EM_DASH}
              </dd>
            </div>
          </dl>
        )}
      </footer>
    </article>
  );
};
