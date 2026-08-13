import { startAnalytics } from "@/features/analytics/posthog";

/**
 * Runs in the browser before the app becomes interactive, so the very first
 * pageview and session recording are not missed.
 *
 * Analytics failing is never worth breaking the app over, so this is contained.
 * A misconfigured PostHog key still fails loudly at server boot in
 * `instrumentation.ts`, which is where a person can actually act on it.
 */
try {
  startAnalytics();
} catch (error) {
  console.error("[analytics] could not start", error);
}
