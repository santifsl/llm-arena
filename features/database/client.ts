import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "./generated/client";

import { serverEnv } from "@/env";

/**
 * A database connection is exactly the kind of side effect that belongs at the
 * edge, and it genuinely has to be shared: hot reload in development would
 * otherwise open a new pool on every file change until Postgres refuses more
 * connections. This module is the one place in the app that keeps state, and it
 * keeps only this.
 *
 * Built on first use rather than at import time, so that `next build` does not
 * need a real connection string.
 */
const connectionCache = globalThis as unknown as {
  arenaPrisma: PrismaClient | undefined;
};

export const database = (): PrismaClient =>
  (connectionCache.arenaPrisma ??= new PrismaClient({
    // Prisma 7 connects through a driver adapter rather than its own engine.
    adapter: new PrismaPg({ connectionString: serverEnv().DATABASE_URL }),
  }));
