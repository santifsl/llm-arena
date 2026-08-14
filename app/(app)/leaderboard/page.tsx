import type { Metadata } from "next";

import { LeaderboardScreen } from "@/features/leaderboard/leaderboard-screen";

export const metadata: Metadata = {
  title: "Leaderboard · LLM Arena",
  description: "Every model's real record, from actual head to head votes.",
};

export default function LeaderboardPage() {
  return <LeaderboardScreen />;
}
