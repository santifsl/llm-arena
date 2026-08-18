import { database } from "@/features/database/client";
import {
  AnswerStatus,
  type Prisma,
} from "@/features/database/generated/client";

import { rankStandings, type Standing } from "./standings";

/**
 * The leaderboard's only read.
 *
 * It lives here rather than in `features/arena/queries.ts` because nothing the
 * arena does needs it and nothing here touches a thread. The two boards are one
 * function with one argument: the global board counts every vote, the personal
 * board counts one person's, and there is no second query for the second board.
 *
 * That the personal filter is a plain column on `Vote` rather than a join back
 * through `Thread` is feature 3's doing, and this is the caller it denormalised
 * that column for.
 */

/**
 * `null` counts everybody's votes. A user id narrows to the votes that person
 * cast, which is not the same as the threads they own: only an owner can vote,
 * so today the two coincide, and filtering on the vote is the one that stays
 * correct if that ever stops being true.
 */
const votedTurn = (
  clerkUserId: string | null,
): Prisma.XOR<
  Prisma.VoteNullableScalarRelationFilter,
  Prisma.VoteWhereInput
> => (clerkUserId === null ? { isNot: null } : { is: { clerkUserId } });

/**
 * Both counts, per model, in two grouped queries rather than one raw statement.
 *
 * The averages are taken over the contested set, not over every answer the
 * model has ever produced, so the whole row describes the same races: these
 * many contests, this record, and this is how fast it was in them. It also
 * makes the personal board mean one person's races all the way across, instead
 * of a personal record sitting next to a global speed.
 *
 * `_avg` skips nulls rather than counting them as zero, which is the behaviour
 * this wants: a provider that reported no time-to-first-token should not drag
 * the average down to a number nothing measured.
 */
export const loadStandings = async (
  clerkUserId: string | null,
): Promise<readonly Standing[]> => {
  const vote = votedTurn(clerkUserId);

  const [contested, won] = await Promise.all([
    database().answer.groupBy({
      by: ["modelId"],
      where: { status: AnswerStatus.COMPLETE, turn: { vote } },
      _count: { _all: true },
      _avg: { timeToFirstTokenMs: true, tokensPerSecond: true },
    }),
    database().answer.groupBy({
      by: ["modelId"],
      where: { status: AnswerStatus.COMPLETE, vote },
      _count: { _all: true },
    }),
  ]);

  return rankStandings(contested, won);
};
