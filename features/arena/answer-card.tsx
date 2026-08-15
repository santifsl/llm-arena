"use client";

import { Check, ChevronDown, RotateCw, TriangleAlert } from "lucide-react";
import { useState } from "react";

import { ModelBadge } from "@/components/model-badge";
import { Trace } from "@/components/trace";
import type { AnswerView } from "@/features/arena/thread";
import type { ArenaModel } from "@/features/models/catalog";
import { cn } from "@/lib/utils";

type AnswerCardProps = {
  readonly answer: AnswerView;
  readonly model: ArenaModel;
  /** The slowest answer in this turn, so every trace shares one scale. */
  readonly scaleMs: number;
  /** Time so far while streaming, total time once the call has ended. */
  readonly elapsedMs: number;
  readonly isWinner?: boolean;
  /** A turn needs two answers before a vote means anything. */
  readonly canVote?: boolean;
  /** Absent when this answer cannot be the winner. */
  readonly onPick?: () => void;
  readonly onRetry?: () => void;
  readonly retrying?: boolean;
};

const formatMs = (ms: number): string =>
  ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(2)} s`;

const EM_DASH = "—";

export const AnswerCard = ({
  answer,
  model,
  scaleMs,
  elapsedMs,
  isWinner = false,
  canVote = false,
  onPick,
  onRetry,
  retrying = false,
}: AnswerCardProps) => {
  const [metricsOpen, setMetricsOpen] = useState(false);
  const failed = answer.state === "failed";
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
        ) : (
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
              This model didn&apos;t answer. The other answers are unaffected.
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
        ) : (
          <p className="answer-prose">
            {answer.text}
            {answer.state === "streaming" && (
              <span
                aria-hidden
                className="ml-0.5 inline-block h-[1em] w-[2px] translate-y-[0.15em] bg-rust motion-safe:animate-pulse"
              />
            )}
          </p>
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
