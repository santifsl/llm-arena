"use client";

import { RotateCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

/**
 * What a screen shows when OpenRouter's catalog could not be read.
 *
 * There is deliberately no local fallback list. A hardcoded set of models would
 * be the one list nobody notices has gone stale, which is the same failure the
 * data model already refused for users and for models.
 *
 * The retry is a real one: the catalog is fetched during the server render, so
 * refreshing the route runs the fetch again.
 */
export const CatalogUnavailable = ({
  className,
}: {
  readonly className?: string;
}) => {
  const router = useRouter();
  const [retrying, startRetry] = useTransition();

  return (
    <div className={className}>
      <p className="text-sm text-ink-dim">
        The model list didn&apos;t load, so there&apos;s nothing to choose from
        yet.
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
