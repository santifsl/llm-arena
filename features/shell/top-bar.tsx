"use client";

import { PanelLeft } from "lucide-react";
import { Fragment, type ReactNode } from "react";

import { useShell } from "@/features/shell/app-shell";

type TopBarProps = {
  /** Read left to right, e.g. ["Arena", "Explaining tokens"]. */
  readonly breadcrumb: readonly string[];
  /** Where a screen puts its own controls, such as the win badges. */
  readonly trailing?: ReactNode;
};

/**
 * Rendered by each screen rather than by the layout, because what sits on the
 * right of it belongs to the screen. The sidebar controls come from shell
 * context so the two stay in step.
 *
 * There are two toggles, not one: on a phone the sidebar is an overlay to open,
 * on a desktop it is a column to collapse, and those are different actions with
 * different labels. Only one is ever visible.
 */
export const TopBar = ({ breadcrumb, trailing }: TopBarProps) => {
  const { collapsed, openDrawer, toggleCollapsed } = useShell();

  return (
    <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-rule bg-ground px-4 py-3">
      <button
        type="button"
        onClick={openDrawer}
        aria-label="Open the menu"
        className="flex size-8 items-center justify-center rounded-sm border border-rule text-ink-dim hover:border-rust hover:text-ink md:hidden"
      >
        <PanelLeft className="size-4" aria-hidden />
      </button>

      <button
        type="button"
        onClick={toggleCollapsed}
        aria-label={collapsed ? "Show the sidebar" : "Hide the sidebar"}
        aria-expanded={!collapsed}
        className="hidden size-8 items-center justify-center rounded-sm border border-rule text-ink-dim hover:border-rust hover:text-ink md:flex"
      >
        <PanelLeft className="size-4" aria-hidden />
      </button>

      <nav aria-label="Breadcrumb" className="min-w-0 flex-1">
        <ol className="flex min-w-0 items-center gap-2 text-sm">
          {breadcrumb.map((crumb, index) => (
            <Fragment key={crumb}>
              {index > 0 && (
                <li aria-hidden className="text-ink-dim/60">
                  /
                </li>
              )}
              <li
                className={
                  index === breadcrumb.length - 1
                    ? "truncate text-ink"
                    : "shrink-0 text-ink-dim"
                }
                aria-current={
                  index === breadcrumb.length - 1 ? "page" : undefined
                }
              >
                {crumb}
              </li>
            </Fragment>
          ))}
        </ol>
      </nav>

      {trailing !== undefined && (
        <div className="flex shrink-0 items-center gap-2">{trailing}</div>
      )}
    </header>
  );
};
