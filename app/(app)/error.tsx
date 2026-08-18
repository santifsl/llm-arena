"use client";

import { useEffect } from "react";

import { posthog } from "@/features/analytics/posthog";

/**
 * A render that threw, anywhere inside the app's shell.
 *
 * The screen follows the same rule every other failure here does: a plain
 * sentence and a way to try again, never the exception. That rule is exactly
 * why this component also reports: the person is told nothing, on purpose, so
 * unless the failure is sent somewhere it is a defect that happened to a real
 * person and left no trace anyone will look at.
 *
 * `digest` is the only handle a production build gives, since React replaces
 * the message with it before it reaches the browser, and it is what ties this
 * to the server log line carrying the same value.
 */
export default function AppError({
  error,
  reset,
}: {
  readonly error: Error & { readonly digest?: string };
  readonly reset: () => void;
}) {
  useEffect(() => {
    if (!posthog.__loaded) return;

    posthog.captureException(error, {
      scope: "app-render",
      digest: error.digest,
    });
  }, [error]);

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 px-4 text-center">
      <h1 className="signage text-2xl">Something went wrong</h1>
      <p role="alert" className="max-w-md text-sm text-ink-dim">
        That screen didn&apos;t load. Try again, and if it keeps happening,
        reload the page.
      </p>
      <button
        type="button"
        onClick={reset}
        className="mt-3 inline-flex items-center gap-1.5 rounded-sm border border-rule px-2 py-1 text-xs text-ink hover:border-rust"
      >
        Try again
      </button>
    </div>
  );
}
