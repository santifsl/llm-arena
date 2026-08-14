"use client";

import { useEffect, useState } from "react";

import { Trace, WinRate, type TraceState } from "@/components/trace";

/**
 * A throwaway harness, exactly like `/proof` before it, and deleted for the
 * same reason once slice 1 has real screens to look at. Its only job is that
 * the palette, the type, the focus ring, and the trace can be checked by eye in
 * a real browser, which the project's rules require and which nothing else in
 * the app can currently do.
 */

type Lane = {
  readonly modelName: string;
  readonly firstTokenMs: number;
  readonly durationMs: number;
  readonly outcome: Exclude<TraceState, "streaming">;
};

// Shapes a real race actually takes: one quick, one slow to start but fast
// once going, one that dies partway.
const LANES: readonly Lane[] = [
  {
    modelName: "Llama 3.3 70B",
    firstTokenMs: 420,
    durationMs: 2600,
    outcome: "done",
  },
  {
    modelName: "Qwen 3 235B",
    firstTokenMs: 1180,
    durationMs: 4100,
    outcome: "done",
  },
  {
    modelName: "Mistral Small 3.2",
    firstTokenMs: 690,
    durationMs: 1850,
    outcome: "failed",
  },
];

const SCALE_MS = Math.max(...LANES.map((lane) => lane.durationMs));
const TICK_MS = 50;

const laneState = (lane: Lane, elapsedMs: number): TraceState =>
  elapsedMs >= lane.durationMs ? lane.outcome : "streaming";

const SWATCHES: readonly (readonly [string, string])[] = [
  ["ground", "bg-ground"],
  ["surface", "bg-surface"],
  ["surface-raised", "bg-surface-raised"],
  ["rule", "bg-rule"],
  ["ink", "bg-ink"],
  ["ink-dim", "bg-ink-dim"],
  ["rust", "bg-rust"],
  ["rust-quiet", "bg-rust-quiet"],
  ["win", "bg-win"],
  ["fail", "bg-fail"],
];

const Section = ({
  title,
  children,
}: {
  readonly title: string;
  readonly children: React.ReactNode;
}) => (
  <section className="border-t border-rule pt-6">
    <h2 className="eyebrow mb-4">{title}</h2>
    {children}
  </section>
);

export const DesignHarness = () => {
  const [elapsedMs, setElapsedMs] = useState(SCALE_MS);
  const [forcedLight, setForcedLight] = useState(false);

  useEffect(() => {
    if (elapsedMs >= SCALE_MS) return;
    const id = setInterval(
      () => setElapsedMs((previous) => Math.min(SCALE_MS, previous + TICK_MS)),
      TICK_MS,
    );
    return () => clearInterval(id);
  }, [elapsedMs]);

  // The harness drives the class directly rather than pulling in a theme
  // library. The real toggle belongs to the app shell in slice 2.
  useEffect(() => {
    document.documentElement.classList.toggle("light", forcedLight);
    return () => document.documentElement.classList.remove("light");
  }, [forcedLight]);

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-10 px-6 py-12">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="signage text-3xl">Design harness</h1>
          <p className="mt-1 text-sm text-ink-dim">
            Throwaway. Deleted when the arena exists.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setForcedLight((previous) => !previous)}
          className="rounded-sm border border-rule bg-surface-raised px-3 py-2 text-sm text-ink hover:border-rust"
        >
          {forcedLight ? "Follow the system" : "Force light mode"}
        </button>
      </header>

      <Section title="Palette">
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {SWATCHES.map(([name, background]) => (
            <li key={name} className="flex flex-col gap-2">
              <span
                className={`block h-12 rounded-sm border border-rule ${background}`}
              />
              <span className="numeral text-[0.6875rem] text-ink-dim">
                {name}
              </span>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Type">
        <div className="flex flex-col gap-4">
          <p className="signage text-4xl">Won 507 of 700</p>
          <p className="text-sm text-ink-dim">
            Archivo, widened, for anything that names or scores something.
          </p>
          <p className="answer-prose max-w-prose">
            A model answer is set in Literata, so that what a model said never
            looks like something this app said. It is the only place a serif
            appears.
          </p>
          <p className="numeral text-sm">1186 ms · 57 tok/s · 1204 tokens</p>
        </div>
      </Section>

      <Section title="The trace">
        <div className="flex flex-col gap-6">
          <button
            type="button"
            onClick={() => setElapsedMs(0)}
            className="w-fit rounded-sm bg-rust px-3 py-2 text-sm font-semibold text-rust-ink hover:opacity-90"
          >
            Run the race
          </button>
          <ul className="grid gap-4 sm:grid-cols-3">
            {LANES.map((lane) => {
              const state = laneState(lane, elapsedMs);
              return (
                <li
                  key={lane.modelName}
                  className="rounded-sm border border-rule bg-surface p-4"
                >
                  <p className="text-sm">{lane.modelName}</p>
                  <Trace
                    modelName={lane.modelName}
                    elapsedMs={Math.min(elapsedMs, lane.durationMs)}
                    firstTokenMs={
                      elapsedMs >= lane.firstTokenMs ? lane.firstTokenMs : null
                    }
                    scaleMs={SCALE_MS}
                    state={state}
                  />
                  <p className="numeral text-[0.6875rem] text-ink-dim">
                    {state === "streaming"
                      ? "answering…"
                      : state === "failed"
                        ? "stopped"
                        : `${lane.durationMs} ms`}
                  </p>
                </li>
              );
            })}
          </ul>
        </div>
      </Section>

      <Section title="The same trace, frozen">
        <div className="flex flex-col gap-6">
          <ul className="flex flex-col gap-4">
            <li className="flex items-center justify-between gap-6 border-b border-rule pb-4">
              <span className="text-sm">Llama 3.3 70B</span>
              <WinRate won={507} of={700} leading />
            </li>
            <li className="flex items-center justify-between gap-6 border-b border-rule pb-4">
              <span className="text-sm">Qwen 3 235B</span>
              <WinRate won={4} of={5} />
            </li>
            <li className="flex items-center justify-between gap-6">
              <span className="text-sm">Mistral Small 3.2</span>
              <WinRate won={0} of={0} />
            </li>
          </ul>
          <div className="flex items-center gap-2">
            <WinRate won={0} of={2} scale="badge" />
            <WinRate won={0} of={2} scale="badge" />
            <WinRate won={1} of={2} scale="badge" leading />
          </div>
        </div>
      </Section>

      <Section title="Meaning never carried by colour alone">
        <div className="flex flex-col gap-3 text-sm">
          <p className="flex items-center gap-2 text-win">
            <span aria-hidden>✓</span> Winner
          </p>
          <p className="flex items-center gap-2 text-fail">
            <span aria-hidden>!</span> This model didn&apos;t answer. Try again.
          </p>
        </div>
      </Section>

      <Section title="Focus">
        <p className="mb-3 text-sm text-ink-dim">
          Tab through these. Every one shows a rust ring.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            className="rounded-sm bg-rust px-3 py-2 text-sm font-semibold text-rust-ink"
          >
            Pick this answer
          </button>
          <button
            type="button"
            className="rounded-sm border border-rule bg-surface-raised px-3 py-2 text-sm"
          >
            Add model
          </button>
          <a href="#top" className="text-sm text-rust underline">
            A link
          </a>
          <input
            aria-label="Prompt"
            placeholder="Ask anything"
            className="rounded-sm border border-rule bg-surface px-3 py-2 text-sm placeholder:text-ink-dim"
          />
        </div>
      </Section>
    </main>
  );
};
