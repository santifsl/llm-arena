import { cn } from "@/lib/utils";

/**
 * The trace: a rust hairline that carries a measured record.
 *
 * It appears at three scales and they are deliberately the same object. In the
 * arena it grows while a model streams and stamps a notch at the first token,
 * so three cards side by side show the race as it happens and keep the evidence
 * afterwards. On the leaderboard it is the frozen version, a win rate. In the
 * top bar it is the same win rate shrunk to a badge.
 *
 * This file lives outside `features/` on purpose. The project files by feature,
 * and this is the one shape more than one feature genuinely shares; copying it
 * into the arena and the leaderboard separately is exactly what the shared
 * component rule exists to prevent.
 */

type Tone = "rust" | "win" | "fail";

const TONE_FILL: Readonly<Record<Tone, string>> = {
  rust: "bg-rust",
  win: "bg-win",
  fail: "bg-fail",
};

const clampFraction = (value: number): number =>
  Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;

const asFraction = (part: number, whole: number): number =>
  whole > 0 ? clampFraction(part / whole) : 0;

const formatDuration = (ms: number): string =>
  ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(1)} s`;

type BarProps = {
  /** How much of the track is filled, 0 to 1. */
  readonly fill: number;
  /** Where the permanent mark sits, 0 to 1. Omitted until there is one. */
  readonly notch?: number | null;
  readonly tone?: Tone;
  /** Smooth the fill's growth. Off for anything already finished. */
  readonly live?: boolean;
  readonly className?: string;
};

/**
 * The hairline itself. Presentational and pure: it is handed fractions and
 * draws them, and never works out what they mean.
 */
const Bar = ({
  fill,
  notch = null,
  tone = "rust",
  live = false,
  className,
}: BarProps) => (
  <span
    className={cn(
      "relative block h-[2px] w-full overflow-visible bg-rust-quiet",
      className,
    )}
  >
    <span
      className={cn(
        "absolute inset-y-0 left-0 block",
        TONE_FILL[tone],
        live &&
          "transition-[width] duration-150 ease-linear motion-reduce:transition-none",
      )}
      style={{ width: `${clampFraction(fill) * 100}%` }}
    />
    {notch !== null && (
      <span
        className="absolute top-1/2 block h-[7px] w-[2px] -translate-x-1/2 -translate-y-1/2 bg-ink"
        style={{ left: `${clampFraction(notch) * 100}%` }}
      />
    )}
  </span>
);

export type TraceState = "streaming" | "done" | "failed";

type TraceProps = {
  /** Time so far while streaming, total time once finished. */
  readonly elapsedMs: number;
  /** Time to first token, once there has been one. */
  readonly firstTokenMs: number | null;
  /** The slowest call in this row, so every lane is read on one scale. */
  readonly scaleMs: number;
  readonly state: TraceState;
  /** Named so the trace can describe itself to a screen reader. */
  readonly modelName: string;
};

const traceLabel = ({
  elapsedMs,
  firstTokenMs,
  state,
  modelName,
}: Omit<TraceProps, "scaleMs">): string => {
  const firstToken =
    firstTokenMs === null
      ? "no first token yet"
      : `first token at ${formatDuration(firstTokenMs)}`;

  if (state === "failed") {
    return `${modelName}: stopped after ${formatDuration(elapsedMs)}, ${firstToken}.`;
  }
  if (state === "streaming") {
    return `${modelName}: still answering, ${formatDuration(elapsedMs)} so far, ${firstToken}.`;
  }
  return `${modelName}: answered in ${formatDuration(elapsedMs)}, ${firstToken}.`;
};

/**
 * One model's lane. The parent owns the clock and hands `elapsedMs` down, so
 * this stays a pure function of its props while a stream is running.
 */
export const Trace = (props: TraceProps) => {
  const { elapsedMs, firstTokenMs, scaleMs, state } = props;

  return (
    <span
      role="img"
      aria-label={traceLabel(props)}
      className="block w-full py-2"
    >
      <Bar
        fill={asFraction(elapsedMs, scaleMs)}
        notch={firstTokenMs === null ? null : asFraction(firstTokenMs, scaleMs)}
        tone={state === "failed" ? "fail" : "rust"}
        live={state === "streaming"}
      />
    </span>
  );
};

type WinRateProps = {
  readonly won: number;
  readonly of: number;
  /** `row` for a leaderboard line, `badge` for the top bar. */
  readonly scale?: "row" | "badge";
  readonly leading?: boolean;
};

const winRateLabel = (won: number, of: number): string =>
  of === 0 ? "no votes yet" : `won ${won} of ${of}`;

/**
 * The frozen trace. The percentage is always accompanied by the real count,
 * because "71%" on its own is the kind of number this product exists to
 * disagree with.
 */
export const WinRate = ({
  won,
  of,
  scale = "row",
  leading = false,
}: WinRateProps) => {
  const fraction = asFraction(won, of);
  const percent = of === 0 ? null : Math.round(fraction * 100);

  if (scale === "badge") {
    return (
      <span className="inline-flex items-center gap-2">
        <span className="numeral text-xs text-ink-dim">
          {won}/{of}
        </span>
        <Bar
          fill={fraction}
          tone={leading ? "win" : "rust"}
          className="w-8 shrink-0"
        />
        <span className="sr-only">{winRateLabel(won, of)}</span>
      </span>
    );
  }

  return (
    <span className="flex items-center gap-3">
      <span
        className={cn(
          "signage text-2xl tabular-nums",
          percent === null ? "text-ink-dim" : "text-rust",
        )}
      >
        {percent === null ? "—" : `${percent}%`}
      </span>
      <span className="flex min-w-24 flex-col gap-1">
        <span className="numeral text-[0.6875rem] text-ink-dim">
          {winRateLabel(won, of)}
        </span>
        <Bar fill={fraction} tone={leading ? "win" : "rust"} />
      </span>
    </span>
  );
};
