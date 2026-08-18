import { RetryButton } from "@/components/retry-button";

/**
 * What a visitor sees when Arcjet refused the read, instead of the thread.
 *
 * The sentence is handed in rather than written here, because the reasons are
 * genuinely different things to be told: too many reads from one network is a
 * wait, and a request that did not look like a browser is not. Both are
 * `features/security/arcjet.ts`'s words, so a rule name or a provider string
 * can never reach this screen.
 *
 * This deliberately does not reuse `CatalogUnavailable`. That component says a
 * fetch failed and the screen is still usable; this one says the screen is all
 * there is. What they do share, the button, is now `RetryButton`.
 */
export const ThreadUnavailable = ({
  message,
}: {
  readonly message: string;
}) => (
  <div className="flex flex-1 flex-col items-center justify-center gap-2 px-4 text-center">
    <h1 className="signage text-2xl">This thread didn&apos;t load</h1>
    <p role="alert" className="max-w-md text-sm text-ink-dim">
      {message}
    </p>
    <RetryButton surface="thread" className="mt-3" />
  </div>
);
