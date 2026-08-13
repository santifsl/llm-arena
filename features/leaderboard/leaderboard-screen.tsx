"use client";

import { useState } from "react";

import { ModelBadge } from "@/components/model-badge";
import { WinRate } from "@/components/trace";
import {
  PLACEHOLDER_GLOBAL_STANDINGS,
  PLACEHOLDER_PERSONAL_STANDINGS,
  findPlaceholderModel,
  type PlaceholderStanding,
} from "@/features/placeholder/data";
import { TopBar } from "@/features/shell/top-bar";
import { cn } from "@/lib/utils";

/**
 * Screen only. The standings are placeholder rows; feature 9 counts real votes.
 */

type Board = "global" | "personal";

const BOARDS: Readonly<
  Record<
    Board,
    {
      readonly label: string;
      readonly heading: string;
      readonly description: string;
      readonly rows: readonly PlaceholderStanding[];
    }
  >
> = {
  global: {
    label: "Global",
    heading: "Global ranking",
    description: "Every vote, from every person who has used the arena.",
    rows: PLACEHOLDER_GLOBAL_STANDINGS,
  },
  personal: {
    label: "Personal",
    heading: "Your ranking",
    description: "Only the votes you cast yourself.",
    rows: PLACEHOLDER_PERSONAL_STANDINGS,
  },
};

export const LeaderboardScreen = () => {
  const [board, setBoard] = useState<Board>("global");
  const { heading, description, rows } = BOARDS[board];

  return (
    <>
      <TopBar breadcrumb={["Leaderboard"]} />

      <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-8">
        <header className="flex flex-col gap-2">
          <h1 className="signage text-3xl">Leaderboard</h1>
          <p className="text-sm text-ink-dim">
            Every model&apos;s real record, from actual head to head votes.
          </p>
        </header>

        <div
          role="tablist"
          aria-label="Which votes to count"
          className="flex w-fit gap-1 rounded-sm border border-rule p-1"
        >
          {(Object.keys(BOARDS) as readonly Board[]).map((key) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={board === key}
              onClick={() => setBoard(key)}
              className={cn(
                "rounded-sm px-3 py-1.5 text-sm",
                board === key
                  ? "bg-rust text-rust-ink"
                  : "text-ink-dim hover:text-ink",
              )}
            >
              {BOARDS[key].label}
            </button>
          ))}
        </div>

        <section className="flex flex-col gap-4">
          <div>
            <h2 className="signage text-lg">{heading}</h2>
            <p className="text-sm text-ink-dim">{description}</p>
          </div>

          <div className="overflow-x-auto rounded-sm border border-rule">
            <table className="w-full min-w-3xl border-collapse text-left">
              <thead>
                <tr className="border-b border-rule">
                  <th scope="col" className="eyebrow px-4 py-3 font-normal">
                    #
                  </th>
                  <th scope="col" className="eyebrow px-4 py-3 font-normal">
                    Model
                  </th>
                  <th scope="col" className="eyebrow px-4 py-3 font-normal">
                    Win rate
                  </th>
                  <th scope="col" className="eyebrow px-4 py-3 font-normal">
                    Avg. to first token
                  </th>
                  <th scope="col" className="eyebrow px-4 py-3 font-normal">
                    Avg. speed
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => {
                  const model = findPlaceholderModel(row.modelId);
                  if (model === undefined) return null;
                  const leading = index === 0;
                  return (
                    <tr
                      key={row.modelId}
                      className={cn(
                        "border-b border-rule last:border-b-0",
                        leading && "bg-surface",
                      )}
                    >
                      <td className="numeral px-4 py-4 text-sm text-ink-dim">
                        {index + 1}
                      </td>
                      <td className="px-4 py-4">
                        <span className="flex items-center gap-2">
                          <ModelBadge initial={model.initial} size="sm" />
                          <span className="text-sm">{model.name}</span>
                        </span>
                      </td>
                      <td className="px-4 py-4">
                        <WinRate won={row.won} of={row.of} leading={leading} />
                      </td>
                      <td className="numeral px-4 py-4 text-sm text-ink-dim">
                        {row.avgFirstTokenMs} ms
                      </td>
                      <td className="numeral px-4 py-4 text-sm text-ink-dim">
                        {row.avgTokensPerSecond} tok/s
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </>
  );
};
