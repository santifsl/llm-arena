import posthog from "posthog-js";

import { publicEnv } from "@/env";

/**
 * Session replay and heatmaps are on from the first visit, which is the point
 * of wiring this in before there is anything to watch: the earliest real
 * sessions are the ones worth seeing.
 *
 * Pageviews are captured manually because the App Router does a soft navigation
 * that PostHog's automatic capture misses.
 */
export const startAnalytics = (): void => {
  const { NEXT_PUBLIC_POSTHOG_KEY, NEXT_PUBLIC_POSTHOG_HOST } = publicEnv();

  posthog.init(NEXT_PUBLIC_POSTHOG_KEY, {
    api_host: NEXT_PUBLIC_POSTHOG_HOST,
    capture_pageview: false,
    capture_pageleave: true,
    disable_session_recording: false,
    enable_heatmaps: true,
    defaults: "2025-05-24",
  });
};

export { posthog };
