"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
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

/** Tailwind's `md`, the width at which the drawer becomes a plain column. */
const DESKTOP_QUERY = "(min-width: 48rem)";

export const AppShell = ({ children }: { readonly children: ReactNode }) => {
  const [collapsed, setCollapsed] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  /** Whatever had focus when the drawer opened, so it can be given back. */
  const triggerRef = useRef<HTMLElement | null>(null);

  const openDrawer = useCallback(() => {
    triggerRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    setDrawerOpen(true);
  }, []);

  // Focus is returned to the control that opened the drawer. Leaving it on a
  // background control means a keyboard user resumes somewhere they never
  // chose, in a part of the page that was behind a backdrop a moment ago.
  const closeDrawer = useCallback(() => {
    setDrawerOpen((wasOpen) => {
      if (wasOpen) triggerRef.current?.focus();
      return false;
    });
  }, []);

  const shell = useMemo<ShellState>(
    () => ({
      collapsed,
      drawerOpen,
      toggleCollapsed: () => setCollapsed((previous) => !previous),
      openDrawer,
      closeDrawer,
    }),
    [collapsed, drawerOpen, openDrawer, closeDrawer],
  );

  useEffect(() => {
    if (!drawerOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeDrawer();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [drawerOpen, closeDrawer]);

  // Widening past `md` turns the drawer back into an ordinary column, and a
  // column must not trap focus. Closing the drawer on that transition keeps
  // "drawer is open" and "drawer is modal" the same statement, which is what
  // the focus trap in `Sidebar` relies on. This measures the viewport, which
  // the two-state design otherwise avoids, but it does so after hydration in
  // response to a resize, so there is nothing here to flash or disagree with
  // the server on first paint.
  useEffect(() => {
    if (!drawerOpen) return;
    const desktop = window.matchMedia(DESKTOP_QUERY);
    if (desktop.matches) {
      closeDrawer();
      return;
    }
    const onChange = (event: MediaQueryListEvent) => {
      if (event.matches) closeDrawer();
    };
    desktop.addEventListener("change", onChange);
    return () => desktop.removeEventListener("change", onChange);
  }, [drawerOpen, closeDrawer]);

  return (
    <ShellContext.Provider value={shell}>
      <div className="flex h-dvh w-full overflow-hidden">
        <Sidebar />

        {/* A mouse affordance only. It is kept out of the tab order because a
            keyboard user closes the drawer with Escape or its own close
            control, and a full-screen tab stop that reads "close" would just
            be a second one of those. */}
        {drawerOpen && (
          <button
            type="button"
            tabIndex={-1}
            aria-hidden
            onClick={closeDrawer}
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
