import type { Metadata } from "next";

import { DesignHarness } from "./design-harness";

export const metadata: Metadata = {
  title: "Design harness · LLM Arena",
  description: "Throwaway page for checking the design tokens by eye.",
};

export default function DesignPage() {
  return <DesignHarness />;
}
