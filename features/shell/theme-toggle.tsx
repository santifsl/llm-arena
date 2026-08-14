"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useSyncExternalStore } from "react";

const NO_OP_SUBSCRIBE = () => () => {};

/**
 * True once the browser is driving, false while the server renders. Written
 * with `useSyncExternalStore` rather than a mount effect because setting state
 * inside an effect just to detect hydration is a cascading render, and React's
 * own lint rule rejects it.
 */
const useHydrated = (): boolean =>
  useSyncExternalStore(
    NO_OP_SUBSCRIBE,
    () => true,
    () => false,
  );

/**
 * Reads the resolved theme rather than the setting, so the button always offers
 * the mode you are not currently in, including when the setting is "system".
 */
export const ThemeToggle = () => {
  const { resolvedTheme, setTheme } = useTheme();
  // The server cannot know which theme the browser resolved, so the label is
  // held back one paint rather than rendered wrong and corrected.
  const mounted = useHydrated();

  const isLight = resolvedTheme === "light";
  const label = !mounted
    ? "Switch theme"
    : isLight
      ? "Switch to dark"
      : "Switch to light";

  return (
    <button
      type="button"
      onClick={() => setTheme(isLight ? "dark" : "light")}
      aria-label={label}
      title={label}
      className="flex size-8 items-center justify-center rounded-sm border border-rule text-ink-dim hover:border-rust hover:text-ink"
    >
      {mounted && isLight ? (
        <Moon className="size-4" aria-hidden />
      ) : (
        <Sun className="size-4" aria-hidden />
      )}
    </button>
  );
};
