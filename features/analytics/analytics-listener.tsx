"use client";

import { useUser } from "@clerk/nextjs";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect } from "react";

import { posthog } from "./posthog";

/**
 * Two jobs, both of which need to run in the browser after Clerk resolves.
 *
 * Pageviews: the App Router navigates without a full page load, so they are
 * captured by hand rather than by PostHog's automatic listener.
 *
 * Identity: events are worth much more attached to a real person than to an
 * anonymous id, so the signed-in user is bound as soon as Clerk knows who they
 * are, and unbound on sign-out so the next visitor is not mistaken for them.
 */
export function AnalyticsListener() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { isLoaded, user } = useUser();

  useEffect(() => {
    if (!posthog.__loaded) return;

    const query = searchParams.toString();

    posthog.capture("$pageview", {
      $current_url: `${window.origin}${pathname}${query === "" ? "" : `?${query}`}`,
    });
  }, [pathname, searchParams]);

  useEffect(() => {
    if (!posthog.__loaded || !isLoaded) return;

    if (user === null || user === undefined) {
      if (posthog._isIdentified()) posthog.reset();
      return;
    }

    posthog.identify(user.id, {
      email: user.primaryEmailAddress?.emailAddress,
    });
  }, [isLoaded, user]);

  return null;
}
