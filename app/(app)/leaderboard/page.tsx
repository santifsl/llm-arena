import { auth } from "@clerk/nextjs/server";
import type { Metadata } from "next";

import { loadStandings } from "@/features/leaderboard/queries";
import {
  LeaderboardScreen,
  type Board,
} from "@/features/leaderboard/leaderboard-screen";
import { loadArenaCatalog } from "@/features/models/catalog";
import { reportServerException } from "@/features/analytics/server";

export const metadata: Metadata = {
  title: "Leaderboard · LLM Arena",
  description: "Every model's real record, from actual head to head votes.",
};

/**
 * Both boards are counted here, on the server, and handed down finished. The
 * board toggle is a client state, so counting per tab would mean a second round
 * trip to say something the first render already knew.
 *
 * This page calls `auth()`, which makes it dynamic. That is correct rather than
 * incidental: a leaderboard cached across requests would show one person's
 * personal board to the next visitor.
 */

/** A failure is a plain sentence on the board, never a broken page. */
const board = async (clerkUserId: string | null): Promise<Board> =>
  loadStandings(clerkUserId)
    .then((rows): Board => ({ kind: "rows", rows }))
    .catch((error: unknown) => {
      reportServerException("could not count standings", error, {
        board: clerkUserId === null ? "global" : "personal",
      });

      return { kind: "unreadable" };
    });

export default async function LeaderboardPage() {
  const { userId } = await auth();

  const [models, global, personal] = await Promise.all([
    loadArenaCatalog(),
    board(null),
    userId === null
      ? Promise.resolve<Board>({ kind: "signed-out" })
      : board(userId),
  ]);

  return (
    <LeaderboardScreen models={models} global={global} personal={personal} />
  );
}
