"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { Sidebar } from "@/features/shell/sidebar";
import { cn } from "@/lib/utils";

/**
 * The frame every screen sits inside: a sidebar and a top bar that stay put
 * while the page scrolls.
 *
 * Desktop and mobile keep separate state on purpose. On a wide screen the
 * sidebar is a column you can collapse and it starts open; on a phone it is an
 * overlay that starts closed. One shared boolean would mean either a phone
 * opening with the sidebar covering the screen, or a desktop opening collapsed.
 * Two states and a CSS breakpoint avoid measuring the viewport in JavaScript,
 * which would either flash or disagree with the server on first paint.
 */

type ShellState = {
  readonly collapsed: boolean;
  readonly drawerOpen: boolean;
  readonly toggleCollapsed: () => void;
  readonly openDrawer: () => void;
  readonly closeDrawer: () => void;
};

const ShellContext = createContext<ShellState | null>(null);

export const useShell = (): ShellState => {
  const shell = useContext(ShellContext);
  if (shell === null) {
    throw new Error("useShell must be used inside AppShell.");
  }
  return shell;
};

export const AppShell = ({ children }: { readonly children: ReactNode }) => {
  const [collapsed, setCollapsed] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const closeDrawer = useCallback(() => setDrawerOpen(false), []);

  const shell = useMemo<ShellState>(
    () => ({
      collapsed,
      drawerOpen,
      toggleCollapsed: () => setCollapsed((previous) => !previous),
      openDrawer: () => setDrawerOpen(true),
      closeDrawer,
    }),
    [collapsed, drawerOpen, closeDrawer],
  );

  useEffect(() => {
    if (!drawerOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeDrawer();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [drawerOpen, closeDrawer]);

  return (
    <ShellContext.Provider value={shell}>
      <div className="flex h-dvh w-full overflow-hidden">
        <Sidebar />

        {drawerOpen && (
          <button
            type="button"
            onClick={closeDrawer}
            aria-label="Close the menu"
            className="fixed inset-0 z-40 bg-black/60 md:hidden"
          />
        )}

        <div
          className={cn(
            "flex min-w-0 flex-1 flex-col overflow-y-auto",
            drawerOpen && "max-md:overflow-hidden",
          )}
        >
          {children}
        </div>
      </div>
    </ShellContext.Provider>
  );
};
