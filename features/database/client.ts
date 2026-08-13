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
export const database = processSingleton(
  "prisma",
  (): PrismaClient =>
    new PrismaClient({
      // Prisma 7 connects through a driver adapter rather than its own engine.
      adapter: new PrismaPg({ connectionString: serverEnv().DATABASE_URL }),
    }),
);
