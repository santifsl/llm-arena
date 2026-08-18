import posthog from "posthog-js";

import { publicEnv } from "@/env";

import { PROXY_PATH } from "./proxy";

/**
 * Session replay and heatmaps are on from the first visit, which is the point
 * of wiring this in before there is anything to watch: the earliest real
 * sessions are the ones worth seeing.
 *
 * Pageviews are captured manually because the App Router does a soft navigation
 * that PostHog's automatic capture misses.
 *
 * Events go to this origin, which `next.config.ts` rewrites on to PostHog. The
 * real host is still handed over as `ui_host`, so the links out of a replay or
 * an event go to the PostHog app rather than to a path on this site that only
 * exists to be proxied.
 *
 * Exceptions are captured too, and that is the one thing the funnel could never
 * see. This app never shows a raw error to anyone, by rule, which means a
 * failure is a plain sentence on screen and a line in a log nobody is reading.
 * `capture_exceptions` picks up what the error boundaries do not: an unhandled
 * rejection, a listener that threw, anything outside a React render.
 */
export const startAnalytics = (): void => {
  const { NEXT_PUBLIC_POSTHOG_KEY, NEXT_PUBLIC_POSTHOG_HOST } = publicEnv();

  posthog.init(NEXT_PUBLIC_POSTHOG_KEY, {
    api_host: PROXY_PATH,
    ui_host: NEXT_PUBLIC_POSTHOG_HOST,
    capture_pageview: false,
    capture_pageleave: true,
    capture_exceptions: true,
    disable_session_recording: false,
    enable_heatmaps: true,
    defaults: "2025-05-24",
  });
};

export { posthog };
