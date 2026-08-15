import type { Metadata } from "next";

import { LeaderboardScreen } from "@/features/leaderboard/leaderboard-screen";
import { loadArenaCatalog } from "@/features/models/catalog";

export const metadata: Metadata = {
  title: "Leaderboard · LLM Arena",
  description: "Every model's real record, from actual head to head votes.",
};

export default async function LeaderboardPage() {
  return <LeaderboardScreen models={await loadArenaCatalog()} />;
}
