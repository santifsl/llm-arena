import { RetryButton } from "@/components/retry-button";

/**
 * What a screen shows when OpenRouter's catalog could not be read.
 *
 * There is deliberately no local fallback list. A hardcoded set of models would
 * be the one list nobody notices has gone stale, which is the same failure the
 * data model already refused for users and for models.
 */
export const CatalogUnavailable = ({
  className,
}: {
  readonly className?: string;
}) => (
  <div className={className}>
    <p className="text-sm text-ink-dim">
      The model list didn&apos;t load, so there&apos;s nothing to choose from
      yet.
    </p>
    <RetryButton surface="catalog" className="mt-3" />
  </div>
);
