"use client";

import { RotateCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

/**
 * What a visitor sees when Arcjet refused the read, instead of the thread.
 *
 * The sentence is handed in rather than written here, because the reasons are
 * genuinely different things to be told: too many reads from one network is a
 * wait, and a request that did not look like a browser is not. Both are
 * `features/security/arcjet.ts`'s words, so a rule name or a provider string
 * can never reach this screen.
 *
 * The retry is real. The decision is made during the server render, so
 * refreshing the route asks again, and a sliding window will have moved by the
 * time somebody has read the sentence and clicked.
 *
 * This deliberately does not reuse `CatalogUnavailable`. That component says a
 * fetch failed and the screen is still usable; this one says the screen is all
 * there is. They share a shape because they are both a sentence and a retry,
 * which is the pattern the whole app uses for a failure, and if a third one
 * appears the button treatment is what should become shared.
 */
export const ThreadUnavailable = ({
  message,
}: {
  readonly message: string;
}) => {
  const router = useRouter();
  const [retrying, startRetry] = useTransition();

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 px-4 text-center">
      <h1 className="signage text-2xl">This thread didn&apos;t load</h1>
      <p role="alert" className="max-w-md text-sm text-ink-dim">
        {message}
      </p>
      <button
        type="button"
        disabled={retrying}
        onClick={() => startRetry(() => router.refresh())}
        className="mt-3 inline-flex items-center gap-1.5 rounded-sm border border-rule px-2 py-1 text-xs text-ink hover:border-rust disabled:opacity-40"
      >
        <RotateCw
          className="size-3.5 motion-safe:data-[spinning=true]:animate-spin"
          data-spinning={retrying}
          aria-hidden
        />
        {retrying ? "Loading" : "Try again"}
      </button>
    </div>
  );
};
