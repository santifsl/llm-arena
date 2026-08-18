"use client";

import { useEffect, useState } from "react";

/**
 * True once something has been pending for longer than a person expects it to
 * be, and false again the moment it settles.
 *
 * The free-tier database suspends itself when it is left alone, and waking it
 * costs ten to nineteen seconds, which `withColdStartRetry` absorbs so the
 * prompt still lands. What it cannot do is explain the wait: the submit is a
 * server round trip with nothing on screen behind it yet, so a resume reads as
 * a dead button rather than as work in progress.
 *
 * The clock is the only signal here on purpose. The browser cannot tell a
 * sleeping database from a slow network or a busy server, and a message that
 * named the cold start would be a guess dressed as a diagnosis. Elapsed time is
 * the one thing it actually knows, so that is what it says.
 *
 * The reset lives in the effect's cleanup rather than in its body, so the next
 * pending run starts fast however slow the last one was, and no render ever
 * writes state synchronously to get there.
 */
export const useSlowPending = (pending: boolean, delayMs: number): boolean => {
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    if (!pending) return;

    const timer = setTimeout(() => setSlow(true), delayMs);

    return () => {
      clearTimeout(timer);
      setSlow(false);
    };
  }, [pending, delayMs]);

  return slow;
};
