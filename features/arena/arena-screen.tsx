"use client";

import { useState } from "react";

import { ModelRecord } from "@/components/model-record";
import { AnswerCard } from "@/features/arena/answer-card";
import { Composer, MAX_MODELS } from "@/features/arena/composer";
import {
  PLACEHOLDER_SELECTED_MODEL_IDS,
  PLACEHOLDER_THREAD_NAME,
  PLACEHOLDER_TURNS,
  findPlaceholderModel,
  type PlaceholderTurn,
} from "@/features/placeholder/data";
import { TopBar } from "@/features/shell/top-bar";
import { cn } from "@/lib/utils";

/**
 * The arena, as a screen only. Nothing here reaches a model, a database, or a
 * vote: the answers come from `features/placeholder`, and picking a winner
 * moves local state and nothing else. Features 5 and 6 replace the data and the
 * actions; the layout, the states, and the copy are what is being built here.
 */

const COLUMNS: Readonly<Record<number, string>> = {
  1: "lg:grid-cols-1",
  2: "lg:grid-cols-2",
  3: "lg:grid-cols-3",
};

const countDone = (turn: PlaceholderTurn): number =>
  turn.answers.filter((answer) => answer.state === "done").length;

const scaleFor = (turn: PlaceholderTurn): number =>
  Math.max(...turn.answers.map((answer) => answer.durationMs), 1);

export const ArenaScreen = () => {
  const [selectedModelIds, setSelectedModelIds] = useState<readonly string[]>(
    PLACEHOLDER_SELECTED_MODEL_IDS,
  );
  const [winners, setWinners] = useState<
    Readonly<Record<string, string | null>>
  >(() =>
    Object.fromEntries(
      PLACEHOLDER_TURNS.map((turn) => [turn.id, turn.winnerModelId]),
    ),
  );

  const votedTurns = Object.values(winners).filter(
    (winner) => winner !== null,
  ).length;

  const records = selectedModelIds.map((modelId) => {
    const model = findPlaceholderModel(modelId);
    const won = Object.values(winners).filter(
      (winner) => winner === modelId,
    ).length;
    return { modelId, model, won };
  });

  const bestWins = Math.max(0, ...records.map((record) => record.won));

  return (
    <>
      <TopBar
        breadcrumb={["Arena", PLACEHOLDER_THREAD_NAME]}
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
        {PLACEHOLDER_TURNS.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
            <h1 className="signage text-2xl">Ask three models at once</h1>
            <p className="max-w-md text-sm text-ink-dim">
              Send one prompt, watch them answer side by side, and pick the one
              that actually answered it.
            </p>
          </div>
        ) : (
          PLACEHOLDER_TURNS.map((turn) => {
            const canVote = countDone(turn) >= 2;
            const scaleMs = scaleFor(turn);
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
                    const model = findPlaceholderModel(answer.modelId);
                    if (model === undefined) return null;
                    return (
                      <AnswerCard
                        key={answer.modelId}
                        answer={answer}
                        model={model}
                        scaleMs={scaleMs}
                        isWinner={winners[turn.id] === answer.modelId}
                        canVote={canVote}
                        onPick={() =>
                          setWinners((previous) => ({
                            ...previous,
                            [turn.id]: answer.modelId,
                          }))
                        }
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
          })
        )}
      </div>

      <div className="sticky bottom-0 border-t border-rule bg-ground px-4 py-4">
        <div className="mx-auto w-full max-w-7xl">
          <Composer
            selectedModelIds={selectedModelIds}
            onAdd={(modelId) =>
              setSelectedModelIds((previous) =>
                previous.length >= MAX_MODELS
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
    </>
  );
};
