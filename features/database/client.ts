import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "./generated/client";

import { serverEnv } from "@/env";
import { processSingleton } from "@/singleton";

/**
 * A database connection is exactly the kind of side effect that belongs at the
 * edge, and it genuinely has to be shared: hot reload in development would
 * otherwise open a new pool on every file change until Postgres refuses more
 * connections.
 *
 * Built on first use rather than at import time, so that `next build` does not
 * need a real connection string. `processSingleton` owns both of those
 * behaviours now, so this file no longer hand-rolls its own `globalThis` cache.
 */
/**
 * How long an idle connection is kept rather than dropped.
 *
 * `pg` defaults this to ten seconds, which is wrong for a remote pooler. A
 * connection to `pooled.db.prisma.io` costs about a second to open, so a person
 * who reads an answer for half a minute before sending the next prompt pays a
 * fresh TCP and TLS handshake for it. Paired with `min` below, which is what
 * stops the last connection being dropped at all: `pg` only reaps an idle
 * client while the pool is above its minimum.
 *
 * This does not pre-open anything. The first call after the process starts
 * still pays full price; every call after it stops paying repeatedly.
 */
const IDLE_TIMEOUT_MS = 5 * 60 * 1000;

/**
 * The budget for getting a transaction started, and then for running it.
 *
 * Both defaults were written for a database on the same machine, and neither
 * survives a round trip of a few hundred milliseconds. `maxWait` defaults to
 * two seconds and covers taking a connection from the pool and issuing `BEGIN`
 * — so a cold connect alone can spend most of it, and starting a turn failed
 * with P2028 on the first prompt after a quiet spell. `timeout` defaults to
 * five seconds for the body, which the several sequential statements in
 * `startTurn` were closer to than anything should be.
 *
 * These are deliberately generous rather than merely sufficient. They are a
 * backstop against a slow link, not a licence for slow transactions: the fix
 * for a transaction that needs this much time is a shorter transaction.
 */
const TRANSACTION_BUDGET = { maxWait: 10_000, timeout: 20_000 } as const;

export const database = processSingleton(
  "prisma",
  (): PrismaClient =>
    new PrismaClient({
      // Prisma 7 connects through a driver adapter rather than its own engine.
      adapter: new PrismaPg({
        connectionString: serverEnv().DATABASE_URL,
        min: 1,
        idleTimeoutMillis: IDLE_TIMEOUT_MS,
      }),
      transactionOptions: TRANSACTION_BUDGET,
    }),
);
