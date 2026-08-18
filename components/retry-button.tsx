"use client";

import { RotateCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { posthog } from "@/features/analytics/posthog";
import { cn } from "@/lib/utils";

/**
 * The retry half of every failure this app shows.
 *
 * The rule is that a person is never shown a raw error, only a plain sentence
 * and a way to try again, so the sentence differs everywhere and the button
 * does not. It was written out three times before this existed, which
 * `ThreadUnavailable` had already flagged as the point at which it should
 * become shared.
 *
 * Refreshing the route is the retry almost everywhere, and for one reason: the
 * catalog fetch, the thread read, and the leaderboard's counts all happen
 * during the server render, so refreshing runs the work again. A component that
 * owns the refresh can say that once instead of each caller re-deciding it.
 *
 * `action` exists for the one place that is not true. A render that threw is
 * recovered by the error boundary's own `reset`, not by a refresh, and that is
 * the only difference between that screen and these three: the sentence, the
 * button, the spinner, and the event are all the same, so the button is shared
 * and only what it calls is passed in.
 *
 * Every press is captured, and `surface` is required rather than optional
 * because the whole value of the event is knowing which one failed. A count of
 * retries with no surface on it says only that something is broken. Being
 * pressed twice is a stronger signal than being pressed once, so the attempt is
 * counted too rather than deduplicated away.
 */

/** Which failure a person is trying to get past. */
export type RetrySurface = "catalog" | "thread" | "standings" | "app-render";

export const RetryButton = ({
  surface,
  action,
  className,
}: {
  readonly surface: RetrySurface;
  /** What trying again actually does. A route refresh unless given. */
  readonly action?: () => void;
  readonly className?: string;
}) => {
  const router = useRouter();
  const [retrying, startRetry] = useTransition();

  const retry = () => {
    posthog.capture("retry_clicked", { surface });

    startRetry(() => (action ? action() : router.refresh()));
  };

  return (
    <button
      type="button"
      disabled={retrying}
      onClick={retry}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-sm border border-rule px-2 py-1 text-xs text-ink hover:border-rust disabled:opacity-40",
        className,
      )}
    >
      <RotateCw
        className="size-3.5 motion-safe:data-[spinning=true]:animate-spin"
        data-spinning={retrying}
        aria-hidden
      />
      {retrying ? "Loading" : "Try again"}
    </button>
  );
};
