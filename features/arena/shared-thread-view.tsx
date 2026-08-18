"use client";

import { useEffect, useRef } from "react";

import { posthog } from "@/features/analytics/posthog";

/**
 * Somebody who is not the owner reading a shared thread.
 *
 * Deliberately captured in the browser, which is the opposite of where the rest
 * of the funnel lives, and the reason is the reader. A visitor is usually
 * signed out, so a server capture would have no distinct id to attach this to:
 * it would either invent one per thread, filling PostHog with people who do not
 * exist, or drop the person entirely. Captured here it lands on PostHog's own
 * anonymous id, which is the same id the session recording and every pageview
 * of that visit already carry, so the view joins up with what they actually
 * did next. That is the whole question sharing raises, and a server event
 * could not answer it.
 *
 * The trade is honest and worth writing down: a content blocker can drop this
 * one, where it could not drop a server event. The ingest proxy is what makes
 * that rare rather than common.
 *
 * Renders nothing. It sits inside the arena screen only because that is the
 * component that knows the thread and the reader.
 */
export const SharedThreadView = ({
  threadId,
  turnCount,
}: {
  readonly threadId: string;
  readonly turnCount: number;
}) => {
  // Once per thread per mount. Effects run twice in development's strict mode,
  // and a doubled view count is the kind of wrong number nobody catches later.
  const reported = useRef<string | null>(null);

  useEffect(() => {
    if (!posthog.__loaded || reported.current === threadId) return;

    reported.current = threadId;

    posthog.capture("shared_thread_viewed", {
      thread_id: threadId,
      turn_count: turnCount,
    });
  }, [threadId, turnCount]);

  return null;
};
