/**
 * What one leaderboard row is, and how the two counts behind it become an
 * order.
 *
 * The counting rule is deliberately narrower than the arena's. Inside a single
 * thread the top bar divides every model's wins by the thread's voted turns,
 * which is right there because the same models race every turn. Across every
 * thread it would be wrong: a model would be charged a loss for a race it was
 * never in, and for a turn where it failed and so was never votable in the
 * first place. A model's denominator here is only the turns it actually
 * contested, meaning it completed an answer and that turn was then voted on.
 */

export type Standing = {
  readonly modelId: string;
  /** Turns this model won. */
  readonly won: number;
  /** Turns it contested: it completed an answer, and the turn was voted. */
  readonly of: number;
  /** Null where the provider never reported the number, which is not zero. */
  readonly avgFirstTokenMs: number | null;
  readonly avgTokensPerSecond: number | null;
};

/** One model's contested answers, as the grouped query hands them back. */
export type ContestedGroup = {
  readonly modelId: string;
  readonly _count: { readonly _all: number };
  readonly _avg: {
    readonly timeToFirstTokenMs: number | null;
    readonly tokensPerSecond: number | null;
  };
};

/** One model's winning answers, same shape without the averages. */
export type WonGroup = {
  readonly modelId: string;
  readonly _count: { readonly _all: number };
};

const winFraction = (standing: Standing): number =>
  standing.of === 0 ? 0 : standing.won / standing.of;

/**
 * Best record first. Two models on the same rate are separated by how many
 * races that rate is made of, because five out of five is a weaker claim than
 * fifty out of fifty and the order should say so. The model id is the last
 * tiebreak purely so the order is stable between renders.
 */
const byRecord = (a: Standing, b: Standing): number =>
  winFraction(b) - winFraction(a) ||
  b.of - a.of ||
  a.modelId.localeCompare(b.modelId);

/**
 * The two grouped counts joined into rows, ranked.
 *
 * Only models that contested something appear. A model nobody has raced has no
 * record rather than a record of zero, and printing it as "won 0 of 0" would
 * read as a loss it never took.
 */
export const rankStandings = (
  contested: readonly ContestedGroup[],
  won: readonly WonGroup[],
): readonly Standing[] => {
  const winsByModel = new Map(
    won.map((group) => [group.modelId, group._count._all]),
  );

  return contested
    .map((group) => ({
      modelId: group.modelId,
      won: winsByModel.get(group.modelId) ?? 0,
      of: group._count._all,
      avgFirstTokenMs:
        group._avg.timeToFirstTokenMs === null
          ? null
          : Math.round(group._avg.timeToFirstTokenMs),
      avgTokensPerSecond:
        group._avg.tokensPerSecond === null
          ? null
          : Math.round(group._avg.tokensPerSecond),
    }))
    .sort(byRecord);
};
