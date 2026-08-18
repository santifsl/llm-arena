"use client";

import { useState } from "react";

import { ModelBadge } from "@/components/model-badge";
import { RetryButton } from "@/components/retry-button";
import { WinRate } from "@/components/trace";
import { modelIdentity, type ArenaModel } from "@/features/models/catalog";
import { TopBar } from "@/features/shell/top-bar";
import { cn } from "@/lib/utils";

import type { Standing } from "./standings";

/**
 * Both boards, from real votes.
 *
 * A row names its model through `modelIdentity`, which means a model
 * OpenRouter has since delisted still appears, labelled with its raw id. That
 * is feature 8's rule about a stored answer applied to a stored vote: a record
 * somebody earned should not vanish because a third party changed its list.
 * The same reasoning is why a catalog that failed to load no longer replaces
 * the whole table with a retry, the way it did while the rows were invented. It
 * costs the pretty names for one render and keeps every real number on screen.
 */

/**
 * What a board has to show. The three cases are genuinely different things to
 * say, and only one of them is a list.
 */
export type Board =
  | { readonly kind: "rows"; readonly rows: readonly Standing[] }
  /** The counts could not be read. Never the underlying error. */
  | { readonly kind: "unreadable" }
  /** There is no personal record to filter by, because nobody is signed in. */
  | { readonly kind: "signed-out" };

type BoardKey = "global" | "personal";

const BOARD_COPY: Readonly<
  Record<
    BoardKey,
    {
      readonly label: string;
      readonly heading: string;
      readonly description: string;
      readonly empty: string;
    }
  >
> = {
  global: {
    label: "Global",
    heading: "Global ranking",
    description: "Every vote, from every person who has used the arena.",
    empty: "Nobody has voted yet, so there is no record to rank.",
  },
  personal: {
    label: "Personal",
    heading: "Your ranking",
    description: "Only the votes you cast yourself.",
    empty: "You haven't voted on a turn yet, so there is nothing to rank.",
  },
};

const HEADINGS: readonly string[] = [
  "#",
  "Model",
  "Win rate",
  "Avg. to first token",
  "Avg. speed",
];

/** A number the provider never reported is a dash, never a zero. */
const measured = (value: number | null, unit: string): string =>
  value === null ? "—" : `${value} ${unit}`;

const Note = ({ children }: { readonly children: React.ReactNode }) => (
  <p className="rounded-sm border border-rule p-4 text-sm text-ink-dim">
    {children}
  </p>
);

const StandingsTable = ({
  rows,
  models,
}: {
  readonly rows: readonly Standing[];
  readonly models: readonly ArenaModel[];
}) => (
  <div className="overflow-x-auto rounded-sm border border-rule">
    <table className="w-full min-w-3xl border-collapse text-left">
      <thead>
        <tr className="border-b border-rule">
          {HEADINGS.map((heading) => (
            <th
              key={heading}
              scope="col"
              className="eyebrow px-4 py-3 font-normal"
            >
              {heading}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, index) => {
          const model = modelIdentity(models, row.modelId);
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
                {measured(row.avgFirstTokenMs, "ms")}
              </td>
              <td className="numeral px-4 py-4 text-sm text-ink-dim">
                {measured(row.avgTokensPerSecond, "tok/s")}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  </div>
);

export const LeaderboardScreen = ({
  models,
  global: globalBoard,
  personal,
}: {
  readonly models: readonly ArenaModel[] | null;
  readonly global: Board;
  readonly personal: Board;
}) => {
  const [key, setKey] = useState<BoardKey>("global");
  const board = key === "global" ? globalBoard : personal;
  const { heading, description, empty } = BOARD_COPY[key];

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
          {(Object.keys(BOARD_COPY) as readonly BoardKey[]).map((option) => (
            <button
              key={option}
              id={`${option}-tab`}
              type="button"
              role="tab"
              aria-selected={key === option}
              aria-controls="standings"
              onClick={() => setKey(option)}
              className={cn(
                "rounded-sm px-3 py-1.5 text-sm",
                key === option
                  ? "bg-rust text-rust-ink"
                  : "text-ink-dim hover:text-ink",
              )}
            >
              {BOARD_COPY[option].label}
            </button>
          ))}
        </div>

        {/* The panel is named by whichever tab is selected, so a screen reader
            reading the standings is told which set of votes they are. */}
        <section
          id="standings"
          role="tabpanel"
          aria-labelledby={`${key}-tab`}
          className="flex flex-col gap-4"
        >
          <div>
            <h2 className="signage text-lg">{heading}</h2>
            <p className="text-sm text-ink-dim">{description}</p>
          </div>

          {/* A model is still named by its id without this, so the table stays
              rather than being replaced by the failure. */}
          {models === null &&
            board.kind === "rows" &&
            board.rows.length > 0 && (
              <Note>
                The model list didn&apos;t load, so these are named by their
                OpenRouter ids.{" "}
                <RetryButton surface="catalog" className="ml-1 align-middle" />
              </Note>
            )}

          {board.kind === "unreadable" ? (
            <Note>
              These standings didn&apos;t load.{" "}
              <RetryButton surface="standings" className="ml-1 align-middle" />
            </Note>
          ) : board.kind === "signed-out" ? (
            <Note>Sign in to see the votes you cast yourself.</Note>
          ) : board.rows.length === 0 ? (
            <Note>{empty}</Note>
          ) : (
            <StandingsTable rows={board.rows} models={models ?? []} />
          )}
        </section>
      </div>
    </>
  );
};
