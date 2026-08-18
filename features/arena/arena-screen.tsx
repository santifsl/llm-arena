"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { AnswerCard } from "@/features/arena/answer-card";
import { Composer } from "@/features/arena/composer";
import { LiveAnswer } from "@/features/arena/live-answer";
import { ModelRecord } from "@/features/arena/model-record";
import {
  refreshThreadList,
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
import { ShareLink } from "@/features/arena/share-link";
import { SharedThreadView } from "@/features/arena/shared-thread-view";
import {
  MAX_SELECTED_MODELS,
  modelIdentity,
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
 * It also serves a visitor who is not the owner, which is feature 8. That is
 * one prop, and it takes away rather than adds: no composer, no pick, no retry.
 * A visitor is a reader of a record, not an owner with the controls greyed out,
 * so the controls are absent rather than disabled. Everything that makes the
 * record what it is, the answers, the traces, the measured numbers, and who
 * won, is identical for both.
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
  defaultModelIds,
  initialThread,
  isOwner,
}: {
  readonly catalog: readonly ArenaModel[] | null;
  /**
   * The trio a brand new thread opens with, decided on the server so a feature
   * flag can move it. `null` on an existing thread, which has its own models
   * and never looks at this.
   */
  readonly defaultModelIds: readonly string[] | null;
  readonly initialThread: ThreadView | null;
  /**
   * Whether this reader may use the thread as well as read it. Decided on the
   * server against the thread's owner; the actions all check it again for
   * themselves, so this only governs what is worth putting on screen.
   */
  readonly isOwner: boolean;
}) => {
  const models = catalog ?? [];
  const [thread, setThread] = useState<ThreadView | null>(initialThread);
  const [selectedModelIds, setSelectedModelIds] = useState<readonly string[]>(
    () =>
      initialThread === null
        ? (defaultModelIds ?? [])
        : currentModelIds(initialThread),
  );
  /** Answer ids this session started, and when each one started. */
  const [startedAt, setStartedAt] = useState<Readonly<Record<string, number>>>(
    {},
  );
  const [now, setNow] = useState(() => Date.now());
  const [notice, setNotice] = useState<string | null>(null);
  const [retryingId, setRetryingId] = useState<string | null>(null);

  /**
   * Set when this session creates a thread, and cleared once its list entry has
   * been asked for. A ref rather than state because it must not itself cause a
   * render: the effect below is driven by the lanes emptying.
   */
  const threadListIsStale = useRef(false);

  const liveIds = Object.keys(startedAt);

  useEffect(() => {
    if (liveIds.length === 0) return;

    const clock = setInterval(() => setNow(Date.now()), CLOCK_INTERVAL_MS);

    return () => clearInterval(clock);
  }, [liveIds.length]);

  /**
   * The new thread joins the sidebar once nothing is streaming.
   *
   * Never while a lane is live. Revalidating mid-race refreshes the router, and
   * by then `replaceState` has pointed it at `/t/[threadId]`, which Next treats
   * as a real navigation: the refresh lands on a different page, unmounts this
   * screen, and destroys all three lanes. The answers still land in the
   * database, because the server drains its own copy of each stream, so the
   * only visible symptom is a browser that goes quiet until a reload. Waiting
   * for the lanes to empty leaves the refresh nothing to tear down.
   */
  useEffect(() => {
    if (!threadListIsStale.current || liveIds.length > 0) return;

    threadListIsStale.current = false;

    void refreshThreadList();
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

    // By id, not by position: another tab may have committed a later turn that
    // this thread read includes, and the last turn would then be someone else's.
    const turn = result.thread.turns.find(({ id }) => id === result.turnId);

    if (turn === undefined) return false;

    // Replacing rather than navigating: the thread gets its shareable URL and
    // the streams about to start are not torn down by a route change. Next
    // patches `replaceState` and adopts this as the router's own URL, which is
    // exactly why nothing may refresh the router until the lanes have settled.
    if (thread === null) {
      window.history.replaceState(null, "", `/t/${result.thread.id}`);
      threadListIsStale.current = true;
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
   */
  const vote = async (turn: TurnView, answer: AnswerView) => {
    setNotice(null);

    const previousWinner = turn.winnerAnswerId;

    setThread((previous) => setWinner(previous, turn.id, answer.id));

    const result = await voteForAnswer({
      turnId: turn.id,
      answerId: answer.id,
      modelId: answer.modelId,
    });

    if (!result.ok) {
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
    model: modelIdentity(models, modelId),
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
            // Never skipped when the catalog does not list the model. A thread
            // outlives the catalog, and an answer quietly vanishing out of a
            // record somebody was sent a link to is the worst version of that.
            const model = modelIdentity(models, answer.modelId);

            return startedAt[answer.id] === undefined ? (
              <AnswerCard
                key={answer.id}
                answer={answer}
                model={model}
                scaleMs={scaleMs}
                elapsedMs={elapsedFor(answer)}
                readOnly={!isOwner}
                isWinner={turn.winnerAnswerId === answer.id}
                canVote={canVote && turn.winnerAnswerId === null}
                onPick={
                  isOwner && answer.state === "complete"
                    ? () => void vote(turn, answer)
                    : undefined
                }
                onRetry={
                  isOwner && answer.state === "failed"
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

        {/* Why the pick control is unavailable, which is only worth saying to
            somebody who has one. */}
        {isOwner && !canVote && (
          <p className="text-xs text-ink-dim">
            Two models have to answer before a vote means anything.
          </p>
        )}
      </section>
    );
  };

  return (
    <>
      {/* Renders nothing. A visitor reading somebody else's thread is the one
          half of sharing the copy-link event cannot see. */}
      {!isOwner && thread !== null && (
        <SharedThreadView
          threadId={thread.id}
          turnCount={thread.turns.length}
        />
      )}

      <TopBar
        breadcrumb={["Arena", thread?.title ?? "New thread"]}
        trailing={
          <>
            {records.map(({ modelId, model, won }) => (
              <ModelRecord
                key={modelId}
                initial={model.initial}
                name={model.name}
                won={won}
                of={votedTurns}
                leading={won > 0 && won === bestWins}
              />
            ))}
            {thread !== null && <ShareLink threadId={thread.id} />}
          </>
        }
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

      {!isOwner && (
        // A visitor gets a line where the composer would be, rather than the
        // page simply ending. Without it a shared thread reads as an arena with
        // its controls missing, instead of as a record somebody sent them.
        <div className="sticky bottom-0 border-t border-rule bg-ground px-4 py-4">
          <p className="mx-auto flex w-full max-w-7xl flex-wrap items-center gap-x-2 gap-y-1 text-sm text-ink-dim">
            You&apos;re reading a shared thread.
            <Link href="/" className="text-rust hover:underline">
              Run your own prompt
            </Link>
          </p>
        </div>
      )}

      {isOwner && catalog !== null && (
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
