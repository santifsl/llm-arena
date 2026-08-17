/**
 * Every invented value in the app, in one place.
 *
 * The shell, the arena screen, the leaderboard, and the models page were built
 * ahead of the features that produce their data, so all of it is fake. Keeping
 * it in one module makes that reversible rather than a hunt: deleting this
 * folder turns the compiler into the list of everything still fake, because
 * every consumer becomes a type error at once.
 *
 * Nothing outside this file invents data. If a screen needs a number it does
 * not have yet, it comes from here.
 *
 * What is left is what feature 9 still stands on: the leaderboard's standings.
 * Feature 5 took the models out, feature 6 took the turns and answers out, and
 * feature 7 took the sidebar's thread list out, so the standings point at a
 * position in the live catalog rather than naming a model of their own.
 *
 * Deleting the whole folder was written into feature 6's plan and turned out to
 * be wrong: it would have forced features 7 and 9 to be built early. The
 * correction is recorded in `docs/scope.md`.
 */

export type PlaceholderStanding = {
  /** A position in the live catalog, for the same reason answers carry one. */
  readonly catalogSlot: number;
  readonly won: number;
  readonly of: number;
  readonly avgFirstTokenMs: number;
  readonly avgTokensPerSecond: number;
};

export const PLACEHOLDER_GLOBAL_STANDINGS: readonly PlaceholderStanding[] = [
  {
    catalogSlot: 1,
    won: 507,
    of: 700,
    avgFirstTokenMs: 1186,
    avgTokensPerSecond: 57,
  },
  {
    catalogSlot: 0,
    won: 402,
    of: 688,
    avgFirstTokenMs: 640,
    avgTokensPerSecond: 71,
  },
  {
    catalogSlot: 3,
    won: 288,
    of: 612,
    avgFirstTokenMs: 2140,
    avgTokensPerSecond: 34,
  },
  {
    catalogSlot: 2,
    won: 190,
    of: 604,
    avgFirstTokenMs: 512,
    avgTokensPerSecond: 88,
  },
  {
    catalogSlot: 4,
    won: 96,
    of: 430,
    avgFirstTokenMs: 980,
    avgTokensPerSecond: 62,
  },
];

export const PLACEHOLDER_PERSONAL_STANDINGS: readonly PlaceholderStanding[] = [
  {
    catalogSlot: 0,
    won: 6,
    of: 9,
    avgFirstTokenMs: 705,
    avgTokensPerSecond: 68,
  },
  {
    catalogSlot: 1,
    won: 3,
    of: 9,
    avgFirstTokenMs: 1204,
    avgTokensPerSecond: 55,
  },
  {
    catalogSlot: 2,
    won: 0,
    of: 4,
    avgFirstTokenMs: 498,
    avgTokensPerSecond: 90,
  },
];
