import { defineConfig } from "prisma/config";

/**
 * Next.js loads `.env.local` for the app itself, but the Prisma CLI does not.
 * `process.loadEnvFile` is built into Node, so this keeps `dotenv` out of the
 * dependency tree entirely.
 *
 * A missing file is fine here: the CLI fails with its own clear message about
 * `DATABASE_URL`, and the app's own startup check in `env.ts` is what actually
 * guards the running server.
 */
try {
  process.loadEnvFile(".env.local");
} catch {
  // No .env.local yet.
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env["DATABASE_URL"],
  },
});
