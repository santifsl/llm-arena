/**
 * How a model's two numbers are written. Both are shown in more than one place,
 * so the formatting lives here rather than being spelled out per screen.
 */

/** Compact, for the picker, where the number is a hint and space is tight. */
export const formatContextTokens = (tokens: number): string =>
  tokens >= 1_000_000
    ? `${Number((tokens / 1_000_000).toFixed(1))}M`
    : `${Math.round(tokens / 1000)}k`;

/**
 * Every model here is free tier, so this reads $0.0000 on every row. That is a
 * real division of the price OpenRouter reports, not a literal typed into the
 * table: the day a paid model is ever added, the number is already right.
 */
export const formatPricePerMillion = (pricePerToken: number): string =>
  `$${(pricePerToken * 1_000_000).toFixed(4)}`;
