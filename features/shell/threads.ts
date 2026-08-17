import type { ThreadSummary } from "@/features/arena/thread";

/**
 * The sidebar's list, in the shape a link can be rendered from.
 *
 * The relative label is computed here, on the server, and crosses to the client
 * as a finished string. Formatting it in the sidebar would mean the browser and
 * the server each reading their own clock, which is a hydration mismatch on any
 * thread near a boundary, and the boundaries here are minutes and midnights.
 *
 * The trade is that the label is written in the server's timezone, not the
 * reader's. For "Just now", "Yesterday", and a weekday name that is invisible
 * in practice, and it is the honest half of the trade: a label that flickers
 * from one word to another on hydration is a defect a person can see.
 */

export type SidebarThread = {
  readonly id: string;
  readonly title: string;
  readonly updatedLabel: string;
};

const MINUTE_MS = 60 * 1000;
const DAY_MS = 24 * 60 * MINUTE_MS;

/** Fixed locale, so the label never depends on the server's own settings. */
const WEEKDAY = new Intl.DateTimeFormat("en-US", { weekday: "long" });
const DAY_AND_MONTH = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
});
const WITH_YEAR = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

/** Midnight at the start of the day a moment falls in. */
const startOfDay = (moment: Date): number =>
  new Date(moment.getFullYear(), moment.getMonth(), moment.getDate()).getTime();

/**
 * How long ago, said the way a person would say it. A thread from this week is
 * named by its day, and anything older by its date, because "6 days ago" is a
 * subtraction the reader has to do and "Tuesday" is not.
 */
export const relativeDayLabel = (moment: Date, now: Date): string => {
  const elapsed = now.getTime() - moment.getTime();

  if (elapsed < MINUTE_MS) return "Just now";

  const daysApart = Math.round((startOfDay(now) - startOfDay(moment)) / DAY_MS);

  if (daysApart <= 0) return "Today";
  if (daysApart === 1) return "Yesterday";
  if (daysApart < 7) return WEEKDAY.format(moment);
  if (moment.getFullYear() === now.getFullYear()) {
    return DAY_AND_MONTH.format(moment);
  }

  return WITH_YEAR.format(moment);
};

export const toSidebarThread = (
  thread: ThreadSummary,
  now: Date,
): SidebarThread => ({
  id: thread.id,
  title: thread.title,
  updatedLabel: relativeDayLabel(thread.updatedAt, now),
});
