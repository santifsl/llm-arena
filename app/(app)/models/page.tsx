import type { Metadata } from "next";

import { ModelsScreen } from "@/features/models/models-screen";

export const metadata: Metadata = {
  title: "Models · LLM Arena",
  description: "Every model the arena can send a prompt to, and what it costs.",
};

export default function ModelsPage() {
  return <ModelsScreen />;
}
