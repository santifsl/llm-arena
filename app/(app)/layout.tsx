import { AppShell } from "@/features/shell/app-shell";

/**
 * Everything the product actually is sits in this group, so it gets the shell.
 * `/proof` and `/design` stay outside it on purpose: both are throwaway
 * harnesses, and wrapping them in the app's own frame would make them look like
 * screens rather than the scaffolding they are.
 */
export default function AppLayout({ children }: LayoutProps<"/">) {
  return <AppShell>{children}</AppShell>;
}
