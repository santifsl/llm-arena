import type { NextConfig } from "next";

import {
  assetsHostFor,
  PROXY_ASSETS_PATH,
  PROXY_PATH,
} from "./features/analytics/proxy";

/**
 * PostHog is served from this origin rather than from its own.
 *
 * The rewrite is only added when the host is present at build time, and that is
 * not a silent fallback: the same variable is inlined into the browser bundle
 * and validated by `publicEnv()`, so a build without it produces a client that
 * refuses to start long before it would ever try to send an event. If the app
 * runs in a browser at all, this rewrite was built with it.
 *
 * `skipTrailingSlashRedirect` is PostHog's own requirement. Some of its
 * endpoints are requested with a trailing slash and Next would otherwise answer
 * the redirect itself, which turns an event into a round trip that never
 * arrives.
 */
const posthogHost = process.env.NEXT_PUBLIC_POSTHOG_HOST;

const nextConfig: NextConfig = {
  skipTrailingSlashRedirect: true,
  rewrites: async () =>
    posthogHost === undefined
      ? []
      : [
          // The assets rule is first on purpose: rewrites match in order, and
          // the ingestion rule below would otherwise swallow this path.
          {
            source: `${PROXY_ASSETS_PATH}/:path*`,
            destination: `${assetsHostFor(posthogHost)}/static/:path*`,
          },
          {
            source: `${PROXY_PATH}/:path*`,
            destination: `${posthogHost}/:path*`,
          },
        ],
};

export default nextConfig;
