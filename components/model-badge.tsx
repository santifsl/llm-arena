import { cn } from "@/lib/utils";

/**
 * A model's mark: one letter in a circle, the way the sketches identify a model
 * everywhere it appears without spending a column on its full name.
 *
 * Deliberately plain. Giving each model a distinct look is on the "not doing
 * right now" list, and doing it here by accident would make the arena's three
 * columns read as three brands rather than three lanes of one race.
 */
export const ModelBadge = ({
  initial,
  size = "md",
  className,
}: {
  readonly initial: string;
  readonly size?: "sm" | "md";
  readonly className?: string;
}) => (
  <span
    aria-hidden
    className={cn(
      "inline-flex shrink-0 items-center justify-center rounded-full border border-rule bg-surface-raised text-ink-dim",
      size === "sm" ? "size-5 text-[0.625rem]" : "size-7 text-xs",
      className,
    )}
  >
    <span className="numeral">{initial}</span>
  </span>
);
