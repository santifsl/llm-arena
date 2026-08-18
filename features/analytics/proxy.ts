/**
 * Where the browser sends its analytics.
 *
 * Straight to `eu.i.posthog.com` is what PostHog's own snippet does, and it is
 * the version a content blocker recognises on sight. This app's funnel is five
 * events long and every one of them that a blocker eats is a person who looks
 * like they never showed up, so the requests go through this origin instead and
 * Next rewrites them on to PostHog.
 *
 * Two hosts are involved, not one. Ingestion goes to the project host that is
 * already in the environment; the recording script and the replay assets come
 * from a sibling host PostHog runs for exactly that, and asking the ingestion
 * host for them returns nothing useful.
 *
 * These are pure string functions with no environment read of their own,
 * because `next.config.ts` needs them at build time, before anything in this
 * app has booted.
 */

/** The path on this origin that stands in for PostHog. */
export const PROXY_PATH = "/ingest";

/** The sub-path under it that serves the script and the replay assets. */
export const PROXY_ASSETS_PATH = `${PROXY_PATH}/static`;

/**
 * PostHog Cloud serves assets from `<region>-assets.i.posthog.com`, alongside
 * the `<region>.i.posthog.com` that takes events. Anything else is a
 * self-hosted instance, which serves both from one origin, so it is left alone
 * rather than having a hostname invented for it.
 */
export const assetsHostFor = (host: string): string =>
  host.replace(
    /^(https:\/\/[a-z0-9-]+)\.i\.posthog\.com$/,
    "$1-assets.i.posthog.com",
  );
