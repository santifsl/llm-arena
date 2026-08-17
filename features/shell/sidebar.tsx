"use client";

import { SignInButton, UserButton, useUser } from "@clerk/nextjs";
import { BarChart3, Boxes, Plus, Swords, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

import { useShell } from "@/features/shell/app-shell";
import { ThemeToggle } from "@/features/shell/theme-toggle";
import type { SidebarThread } from "@/features/shell/threads";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/", label: "Arena", Icon: Swords },
  { href: "/leaderboard", label: "Leaderboard", Icon: BarChart3 },
  { href: "/models", label: "Models", Icon: Boxes },
] as const;

/** Everything that can hold focus inside the drawer, in document order. */
const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(", ");

const isActive = (pathname: string, href: string): boolean =>
  href === "/" ? pathname === "/" : pathname.startsWith(href);

export const Sidebar = ({
  threads,
}: {
  /** This person's threads, read on the server. Null if that read failed. */
  readonly threads: readonly SidebarThread[] | null;
}) => {
  const { collapsed, drawerOpen, closeDrawer } = useShell();
  const pathname = usePathname();
  const closeRef = useRef<HTMLButtonElement>(null);
  const asideRef = useRef<HTMLElement>(null);

  // Clerk's `<Show>` is a server component and this sidebar is a client one, so
  // the hook is the way in. Until it has loaded, neither state is rendered:
  // showing "Sign in" to someone already signed in, for half a second, reads as
  // the app having lost them.
  const { isLoaded, isSignedIn } = useUser();

  // Opening an overlay that swallows the screen without moving focus into it
  // leaves a keyboard user tabbing through what is behind the backdrop.
  useEffect(() => {
    if (drawerOpen) closeRef.current?.focus();
  }, [drawerOpen]);

  // While it is a drawer it is modal, so Tab has to stay inside it. Without
  // this, tabbing past the last link walks into the page behind the backdrop,
  // which is both unreachable by mouse and invisible under it.
  //
  // `AppShell` closes the drawer when the viewport widens past `md`, so
  // `drawerOpen` can be trusted to mean "modal" here. On a wide screen this is
  // an ordinary column and trapping focus in it would be the actual bug.
  useEffect(() => {
    const aside = asideRef.current;
    if (!drawerOpen || aside === null) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;

      const focusable = Array.from(
        aside.querySelectorAll<HTMLElement>(FOCUSABLE),
      ).filter((element) => element.offsetParent !== null);
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      const leavingBackwards = event.shiftKey && active === first;
      const leavingForwards = !event.shiftKey && active === last;
      const escaped = !(active instanceof Node) || !aside.contains(active);

      if (leavingBackwards || (escaped && event.shiftKey)) {
        event.preventDefault();
        last.focus();
      } else if (leavingForwards || escaped) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [drawerOpen]);

  return (
    <aside
      ref={asideRef}
      // Only a dialog while it is a drawer. As a desktop column it is a plain
      // landmark, and claiming to be modal there would be a lie to a screen
      // reader.
      role={drawerOpen ? "dialog" : undefined}
      aria-modal={drawerOpen ? true : undefined}
      aria-label="Main menu"
      className={cn(
        "w-64 shrink-0 flex-col border-r border-rule bg-surface",
        "max-md:fixed max-md:inset-y-0 max-md:left-0 max-md:z-50",
        drawerOpen ? "max-md:flex" : "max-md:hidden",
        collapsed ? "md:hidden" : "md:flex",
      )}
    >
      <div className="flex items-center justify-between px-5 py-4">
        <Link href="/" className="signage text-base tracking-tight">
          LLM Arena
        </Link>
        <button
          ref={closeRef}
          type="button"
          onClick={closeDrawer}
          aria-label="Close the menu"
          className="flex size-8 items-center justify-center rounded-sm text-ink-dim hover:text-ink md:hidden"
        >
          <X className="size-4" aria-hidden />
        </button>
      </div>

      <nav className="px-3">
        <ul className="flex flex-col gap-0.5">
          {NAV.map(({ href, label, Icon }) => {
            const active = isActive(pathname, href);
            return (
              <li key={href}>
                <Link
                  href={href}
                  onClick={closeDrawer}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "relative flex items-center gap-2.5 rounded-sm px-2.5 py-2 text-sm",
                    // An instrument panel lights an indicator; it does not
                    // highlight the whole switch.
                    "before:absolute before:top-1/2 before:left-0 before:h-4 before:w-[2px] before:-translate-y-1/2",
                    active
                      ? "text-ink before:bg-rust"
                      : "text-ink-dim before:bg-transparent hover:text-ink",
                  )}
                >
                  <Icon className="size-4 shrink-0" aria-hidden />
                  {label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="mt-6 flex min-h-0 flex-1 flex-col border-t border-rule pt-4">
        <div className="flex items-center justify-between px-5">
          <h2 className="eyebrow">Your threads</h2>
        </div>

        <Link
          href="/"
          onClick={closeDrawer}
          className="mx-3 mt-2 flex items-center gap-2 rounded-sm px-2.5 py-2 text-sm text-rust hover:bg-surface-raised"
        >
          <Plus className="size-4" aria-hidden />
          New thread
        </Link>

        {isLoaded && isSignedIn && threads === null && (
          <p className="mt-2 px-5 text-sm text-ink-dim">
            Your threads could not be loaded. Reload the page to try again.
          </p>
        )}

        {isLoaded && isSignedIn && threads?.length === 0 && (
          <p className="mt-2 px-5 text-sm text-ink-dim">
            Send a prompt and it shows up here.
          </p>
        )}

        {isLoaded && isSignedIn && threads !== null && threads.length > 0 && (
          <ul className="mt-1 flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-3 pb-4">
            {threads.map((thread) => {
              const active = pathname === `/t/${thread.id}`;

              return (
                <li key={thread.id}>
                  <Link
                    href={`/t/${thread.id}`}
                    onClick={closeDrawer}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex flex-col rounded-sm px-2.5 py-2 hover:bg-surface-raised",
                      active && "bg-surface-raised",
                    )}
                  >
                    <span
                      className={cn(
                        "truncate text-sm",
                        active ? "text-ink" : "text-ink-dim",
                      )}
                    >
                      {thread.title}
                    </span>
                    <span className="numeral text-[0.625rem] text-ink-dim/70">
                      {thread.updatedLabel}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}

        {isLoaded && !isSignedIn && (
          <p className="mt-2 px-5 text-sm text-ink-dim">
            Sign in and your threads are kept here.
          </p>
        )}
      </div>

      <div className="flex min-h-16 items-center gap-2 border-t border-rule px-5 py-4 [&>:last-child]:ml-auto">
        {isLoaded &&
          (isSignedIn ? (
            <UserButton />
          ) : (
            <SignInButton mode="modal">
              <button
                type="button"
                className="rounded-sm border border-rule px-2.5 py-1.5 text-sm text-ink hover:border-rust"
              >
                Sign in
              </button>
            </SignInButton>
          ))}
        <ThemeToggle />
      </div>
    </aside>
  );
};
