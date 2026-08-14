import { z } from "zod";

/**
 * Every secret the server needs. Validated in one place so a missing value is a
 * loud, named failure at boot rather than a confusing one on someone's first
 * prompt.
 */
const serverEnvSchema = z.object({
  OPENROUTER_API_KEY: z
    .string()
    .min(1, "required: create a key at https://openrouter.ai/keys"),
  CLERK_SECRET_KEY: z.string().min(1, "required: Clerk dashboard, API keys"),
  DATABASE_URL: z.string().min(1, "required: a Postgres connection string"),
  ARCJET_KEY: z.string().min(1, "required: Arcjet console, site key"),
});

/**
 * Values the browser is allowed to see. These are separate from the server set
 * because Next.js only inlines `NEXT_PUBLIC_` variables that are referenced
 * literally, so they cannot be read off a `process.env` sweep.
 */
const publicEnvSchema = z.object({
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: z
    .string()
    .min(1, "required: Clerk dashboard, API keys"),
  NEXT_PUBLIC_POSTHOG_KEY: z
    .string()
    .min(1, "required: PostHog project settings"),
  NEXT_PUBLIC_POSTHOG_HOST: z.url(
    "required: usually https://eu.i.posthog.com or https://us.i.posthog.com",
  ),
});

export type ServerEnv = Readonly<z.infer<typeof serverEnvSchema>>;
export type PublicEnv = Readonly<z.infer<typeof publicEnvSchema>>;

const formatIssues = (issues: readonly z.core.$ZodIssue[]): string =>
  issues
    .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
    .join("\n");

const parseEnv = <T>(
  schema: z.ZodType<T>,
  source: unknown,
  label: string,
): Readonly<T> => {
  const result = schema.safeParse(source);

  if (!result.success) {
    throw new Error(
      `${label} environment is not usable, refusing to start:\n${formatIssues(
        result.error.issues,
      )}\n\nAdd the missing values to .env.local and restart.`,
    );
  }

  return Object.freeze(result.data);
};

/**
 * Functions, not module-level constants, so that reading the environment is an
 * explicit act at boot or render time. `instrumentation.ts` calls `serverEnv`
 * once when the server starts, which is what turns a missing key into a startup
 * failure. Keeping the read out of module scope also means `next build` does
 * not need production secrets to succeed.
 *
 * Re-parsing per call is pure and cheap, and avoids a cached module singleton.
 */
export const serverEnv = (): ServerEnv =>
  parseEnv(serverEnvSchema, process.env, "Server");

export const publicEnv = (): PublicEnv =>
  parseEnv(
    publicEnvSchema,
    {
      NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY:
        process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
      NEXT_PUBLIC_POSTHOG_KEY: process.env.NEXT_PUBLIC_POSTHOG_KEY,
      NEXT_PUBLIC_POSTHOG_HOST: process.env.NEXT_PUBLIC_POSTHOG_HOST,
    },
    "Public",
  );
