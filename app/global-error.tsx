"use client";

import { useEffect } from "react";

import { posthog } from "@/features/analytics/posthog";

/**
 * The root layout itself failing, which is the one case `(app)/error.tsx` can
 * never catch: it lives inside the layout that broke.
 *
 * It has to render its own `<html>` and `<body>`, so it cannot use the app's
 * fonts or theme, and it deliberately does not try. Nothing is styled with a
 * token here because the stylesheet is part of what may not have loaded. Inline
 * styles are the only ones certain to apply, and they are written for both
 * schemes so this is legible either way.
 */
export default function GlobalError({
  error,
  reset,
}: {
  readonly error: Error & { readonly digest?: string };
  readonly reset: () => void;
}) {
  useEffect(() => {
    if (!posthog.__loaded) return;

    posthog.captureException(error, {
      scope: "root-layout",
      digest: error.digest,
    });
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          display: "flex",
          minHeight: "100vh",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "0.5rem",
          padding: "1rem",
          textAlign: "center",
          fontFamily: "system-ui, sans-serif",
          colorScheme: "light dark",
        }}
      >
        <h1 style={{ fontSize: "1.25rem", fontWeight: 600 }}>
          LLM Arena didn&apos;t load
        </h1>
        <p role="alert" style={{ maxWidth: "28rem", fontSize: "0.875rem" }}>
          Something went wrong before the page could be drawn. Try again, and if
          it keeps happening, come back in a few minutes.
        </p>
        <button
          type="button"
          onClick={reset}
          style={{
            marginTop: "0.75rem",
            padding: "0.25rem 0.5rem",
            fontSize: "0.75rem",
            border: "1px solid currentColor",
            borderRadius: "0.125rem",
            background: "transparent",
            color: "inherit",
            cursor: "pointer",
          }}
        >
          Try again
        </button>
      </body>
    </html>
  );
}
