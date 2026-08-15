"use client";

import { useCallback, useEffect, useState } from "react";

import { AnswerCard } from "@/features/arena/answer-card";
import { Composer } from "@/features/arena/composer";
import { LiveAnswer } from "@/features/arena/live-answer";
import { ModelRecord } from "@/features/arena/model-record";
import {
  retryModel,
  submitPrompt,
  voteForAnswer,
} from "@/features/arena/actions";
import {
  completedAnswerCount,
  currentModelIds,
  type AnswerView,
  type ThreadView,
  type TurnView,
} from "@/features/arena/thread";
import {
  MAX_SELECTED_MODELS,
  defaultSelectedModelIds,
  findArenaModel,
  type ArenaModel,
} from "@/features/models/catalog";
import { CatalogUnavailable } from "@/features/models/catalog-unavailable";
import { TopBar } from "@/features/shell/top-bar";
import { cn } from "@/lib/utils";

/**
 * The arena: one prompt, up to three models answering at once.
 *
 * The same screen serves a brand new thread and an existing one. A new thread
 * gets its URL the moment it exists, by replacing the address rather than
 * navigating, because navigating would unmount the streams that were just
 * started. A reload after that renders the thread from the database instead.
 *
 * This component owns the clock, exactly as the design intended: it ticks while
 * anything is still answering, and every trace is a pure function of the
 * elapsed time it is handed. Each lane owns its own stream and reports its
 * finished answer back once, so a model streaming does not re-render the thread
 * around it.
 */

const COLUMNS: Readonly<Record<number, string>> = {
  1: "lg:grid-cols-1",
  2: "lg:grid-cols-2",
  3: "lg:grid-cols-3",
};

const CLOCK_INTERVAL_MS = 100;

const setWinner = (
  thread: ThreadView | null,
  turnId: string,
  winnerAnswerId: string | null,
): ThreadView | null =>
  thread === null
    ? thread
    : {
        ...thread,
        turns: thread.turns.map((turn) =>
          turn.id === turnId ? { ...turn, winnerAnswerId } : turn,
        ),
      };

const replaceAnswer = (
  thread: ThreadView,
  answerId: string,
  next: AnswerView,
): ThreadView => ({
  ...thread,
  turns: thread.turns.map((turn) => ({
    ...turn,
    answers: turn.answers.map((answer) =>
      answer.id === answerId ? next : answer,
    ),
  })),
});

export const ArenaScreen = ({
  catalog,
  initialThread,
}: {
  readonly catalog: readonly ArenaModel[] | null;
  readonly initialThread: ThreadView | null;
}) => {
  const models = catalog ?? [];
  const [thread, setThread] = useState<ThreadView | null>(initialThread);
  const [selectedModelIds, setSelectedModelIds] = useState<readonly string[]>(
    () =>
      initialThread === null
        ? defaultSelectedModelIds(models)
        : currentModelIds(initialThread),
  );
  /** Answer ids this session started, and when each one started. */
  const [startedAt, setStartedAt] = useState<Readonly<Record<string, number>>>(
    {},
  );
  const [now, setNow] = useState(() => Date.now());
  const [notice, setNotice] = useState<string | null>(null);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [voting, setVoting] = useState(false);

  const liveIds = Object.keys(startedAt);

  useEffect(() => {
    if (liveIds.length === 0) return;

    const clock = setInterval(() => setNow(Date.now()), CLOCK_INTERVAL_MS);

    return () => clearInterval(clock);
  }, [liveIds.length]);

  const elapsedFor = (answer: AnswerView): number => {
    if (answer.metrics !== null) return answer.metrics.durationMs;

    const started = startedAt[answer.id];

    return started === undefined ? 0 : Math.max(0, now - started);
  };

  const settle = useCallback((answerId: string, settled: AnswerView) => {
    setThread((previous) =>
      previous === null ? previous : replaceAnswer(previous, answerId, settled),
    );
    setStartedAt((previous) =>
      Object.fromEntries(
        Object.entries(previous).filter(([id]) => id !== answerId),
      ),
    );
  }, []);

  const send = async (prompt: string): Promise<boolean> => {
    setNotice(null);

    const result = await submitPrompt({
      threadId: thread?.id ?? null,
      prompt,
      modelIds: selectedModelIds,
    });

    if (!result.ok) {
      setNotice(result.message);
      return false;
    }

    const turn = result.thread.turns.at(-1);

    if (turn === undefined) return false;

    // Replacing rather than navigating: the thread gets its shareable URL and
    // the streams about to start are not torn down by a route change.
    if (thread === null) {
      window.history.replaceState(null, "", `/t/${result.thread.id}`);
    }

    const startedNow = Date.now();

    setThread(result.thread);
    setStartedAt((previous) => ({
      ...previous,
      ...Object.fromEntries(turn.answers.map(({ id }) => [id, startedNow])),
    }));

    return true;
  };

  const retry = async (answer: AnswerView) => {
    setNotice(null);
    setRetryingId(answer.id);

    const result = await retryModel(answer.id);

    setRetryingId(null);

    if (!result.ok) {
      setNotice(result.message);
      return;
    }

    setThread((previous) =>
      previous === null
        ? previous
        : replaceAnswer(previous, answer.id, result.answer),
    );
    setStartedAt((previous) => ({ ...previous, [answer.id]: Date.now() }));
  };

  /**
   * The winner shows the moment it is picked, and is put back if the write is
   * refused. A vote is one click on something already on screen, so waiting for
   * a round trip to move the border would read as the click not registering.
   *
   * A vote already in flight blocks a second one, the same way a retry does. A
   * double click would otherwise cast the same vote twice, and the second one
   * loses the race and reports a failure for a vote that is already stored.
   *
   * A refusal only takes the winner back when no winner is stored. When the
   * refusal says one already is, the winner stays and no error is shown,
   * because the stored state and the screen agree.
   */
  const vote = async (turn: TurnView, answer: AnswerView) => {
    if (voting) return;

    setNotice(null);
    setVoting(true);

    const previousWinner = turn.winnerAnswerId;

    setThread((previous) => setWinner(previous, turn.id, answer.id));

    const result = await voteForAnswer({
      turnId: turn.id,
      answerId: answer.id,
      modelId: answer.modelId,
    });

    setVoting(false);

    if (!result.ok && !result.settled) {
      setThread((previous) => setWinner(previous, turn.id, previousWinner));
      setNotice(result.message);
    }
  };

  const votedTurns =
    thread?.turns.filter((turn) => turn.winnerAnswerId !== null).length ?? 0;

  const winsFor = (modelId: string): number =>
    thread?.turns.filter((turn) =>
      turn.answers.some(
        (answer) =>
          answer.id === turn.winnerAnswerId && answer.modelId === modelId,
      ),
    ).length ?? 0;

  const records = selectedModelIds.map((modelId) => ({
    modelId,
    model: findArenaModel(models, modelId),
    won: winsFor(modelId),
  }));

  const bestWins = Math.max(0, ...records.map((record) => record.won));

  const renderTurn = (turn: TurnView) => {
    const canVote = completedAnswerCount(turn) >= 2;
    const scaleMs = Math.max(1, ...turn.answers.map(elapsedFor));
    const columns = COLUMNS[turn.answers.length] ?? COLUMNS[3];

    return (
      <section key={turn.id} className="flex flex-col gap-4">
        <div className="flex justify-end">
          <p className="max-w-2xl rounded-sm border border-rule bg-surface-raised px-3 py-2 text-sm">
            {turn.prompt}
          </p>
        </div>

        <div className={cn("grid gap-4 sm:grid-cols-2", columns)}>
          {turn.answers.map((answer) => {
            const model = findArenaModel(models, answer.modelId);

            if (model === undefined) return null;

            return startedAt[answer.id] === undefined ? (
              <AnswerCard
                key={answer.id}
                answer={answer}
                model={model}
                scaleMs={scaleMs}
                elapsedMs={elapsedFor(answer)}
                isWinner={turn.winnerAnswerId === answer.id}
                canVote={canVote && turn.winnerAnswerId === null}
                onPick={
                  answer.state === "complete"
                    ? () => void vote(turn, answer)
                    : undefined
                }
                onRetry={
                  answer.state === "failed"
                    ? () => void retry(answer)
                    : undefined
                }
                retrying={retryingId === answer.id}
              />
            ) : (
              <LiveAnswer
                key={answer.id}
                answer={answer}
                model={model}
                prompt={turn.prompt}
                scaleMs={scaleMs}
                elapsedMs={elapsedFor(answer)}
                onSettled={settle}
              />
            );
          })}
        </div>

        {!canVote && (
          <p className="text-xs text-ink-dim">
            Two models have to answer before a vote means anything.
          </p>
        )}
      </section>
    );
  };

  return (
    <>
      <TopBar
        breadcrumb={["Arena", thread?.title ?? "New thread"]}
        trailing={records.map(({ modelId, model, won }) =>
          model === undefined ? null : (
            <ModelRecord
              key={modelId}
              initial={model.initial}
              name={model.name}
              won={won}
              of={votedTurns}
              leading={won > 0 && won === bestWins}
            />
          ),
        )}
      />

      <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-12 px-4 py-8">
        {catalog === null ? (
          <div className="flex flex-1 flex-col items-center justify-center text-center">
            <CatalogUnavailable />
          </div>
        ) : thread === null ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
            <h1 className="signage text-2xl">Ask three models at once</h1>
            <p className="max-w-md text-sm text-ink-dim">
              Send one prompt, watch them answer side by side, and pick the one
              that actually answered it.
            </p>
          </div>
        ) : (
          thread.turns.map(renderTurn)
        )}
      </div>

      {catalog !== null && (
        <div className="sticky bottom-0 border-t border-rule bg-ground px-4 py-4">
          <div className="mx-auto flex w-full max-w-7xl flex-col gap-2">
            {notice !== null && (
              <p role="alert" className="text-sm text-fail">
                {notice}
              </p>
            )}
            <Composer
              models={catalog}
              selectedModelIds={selectedModelIds}
              busy={liveIds.length > 0}
              onSubmit={send}
              onAdd={(modelId) =>
                setSelectedModelIds((previous) =>
                  previous.length >= MAX_SELECTED_MODELS
                    ? previous
                    : [...previous, modelId],
                )
              }
              onRemove={(modelId) =>
                setSelectedModelIds((previous) =>
                  previous.filter((id) => id !== modelId),
                )
              }
            />
          </div>
        </div>
      )}
    </>
  );
};
