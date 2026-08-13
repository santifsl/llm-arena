"use client";

import { ThemeProvider as NextThemeProvider } from "next-themes";
import type { ReactNode } from "react";

/**
 * Themes are class-based because `globals.css` already keys light mode off a
 * `.light` class and dark off `:root`. The library is here for one reason: it
 * writes a blocking script that sets the class before first paint, so a person
 * who prefers light never sees a frame of the dark ground first. Hand-rolling
 * that script is the only thing this replaces.
 */
export const ThemeProvider = ({
  children,
}: {
  readonly children: ReactNode;
}) => (
  <NextThemeProvider
    attribute="class"
    defaultTheme="system"
    enableSystem
    disableTransitionOnChange
  >
    {children}
  </NextThemeProvider>
);
