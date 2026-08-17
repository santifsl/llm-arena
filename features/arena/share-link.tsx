"use client";

import { Check, Link2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

/**
 * Copying a thread's link.
 *
 * Feature 8 opened thread pages to anyone holding the link, and without a
 * control that hands one over the feature is only shareable in principle: the
 * address bar works, but a thread started from `/` gets its URL through
 * `history.replaceState`, which is exactly the kind of thing a person does not
 * think to go and select.
 *
 * The owner and a visitor both get this, because a link worth reading is a link
 * worth passing on.
 */

/** Long enough to read, short enough that the button is not stuck saying it. */
const COPIED_FOR_MS = 2000;

export const ShareLink = ({ threadId }: { readonly threadId: string }) => {
  const [copied, setCopied] = useState(false);
  /** Set only when the clipboard refused, which is the manual way out. */
  const [fallbackUrl, setFallbackUrl] = useState<string | null>(null);
  const fallbackRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!copied) return;

    const timer = setTimeout(() => setCopied(false), COPIED_FOR_MS);

    return () => clearTimeout(timer);
  }, [copied]);

  // Selecting it is the whole point of showing it, so a person can copy with
  // the keyboard rather than dragging across a line of text.
  useEffect(() => {
    if (fallbackUrl !== null) fallbackRef.current?.select();
  }, [fallbackUrl]);

  // Built from the id rather than read off the address bar: the arena replaces
  // the URL without navigating, and this way the link cannot pick up a query
  // string or a fragment that happens to be sitting there.
  const share = async () => {
    const url = `${window.location.origin}/t/${threadId}`;

    // A clipboard write is refused outright on an insecure origin and by some
    // permission setups, and that is an ordinary outcome rather than a fault:
    // the URL is shown instead, and nothing raw ever reaches the screen.
    const wrote = await navigator.clipboard
      ?.writeText(url)
      .then(() => true)
      .catch(() => false);

    if (wrote === true) {
      setFallbackUrl(null);
      setCopied(true);
    } else {
      setFallbackUrl(url);
    }
  };

  return (
    <span className="flex items-center gap-2">
      {fallbackUrl !== null && (
        <>
          <label htmlFor="share-url" className="sr-only">
            This thread&apos;s link, ready to copy
          </label>
          <input
            ref={fallbackRef}
            id="share-url"
            type="text"
            readOnly
            value={fallbackUrl}
            onFocus={(event) => event.currentTarget.select()}
            className="numeral w-44 rounded-sm border border-rule bg-surface px-2 py-1 text-xs text-ink-dim outline-none focus:border-rust"
          />
        </>
      )}

      <button
        type="button"
        onClick={() => void share()}
        className="inline-flex shrink-0 items-center gap-1.5 rounded-sm border border-rule px-2 py-1 text-xs text-ink-dim hover:border-rust hover:text-ink"
      >
        {copied ? (
          <Check className="size-3.5 text-win" aria-hidden />
        ) : (
          <Link2 className="size-3.5" aria-hidden />
        )}
        {copied ? "Link copied" : "Copy link"}
      </button>

      {/* Announced rather than only drawn, since the button's own label
          changing is not something a screen reader is told about. */}
      <span aria-live="polite" className="sr-only">
        {copied ? "Link copied to the clipboard." : ""}
      </span>
    </span>
  );
};
