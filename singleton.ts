/**
 * The one place in this app that keeps process-wide state.
 *
 * Some clients genuinely have to be shared rather than rebuilt. A database pool
 * is the clear case: Next.js re-evaluates modules on every hot reload in
 * development, so a fresh pool per reload keeps opening connections until
 * Postgres refuses more. Arcjet is the milder case, where a rebuilt client
 * throws away its local decision cache and re-asks the service for answers it
 * already had.
 *
 * Both were solving this by casting `globalThis` themselves, which meant two
 * hand-rolled caches and two unchecked casts. This module exists so that the
 * "keeps state across reloads" trick lives in exactly one documented place and
 * every caller reads as an ordinary function.
 *
 * Building on first call rather than at import time is the other half of the
 * point: `next build` must not need real secrets to succeed, so nothing may
 * read the environment while a module is merely being loaded.
 */
const registry = globalThis as unknown as {
  arenaSingletons?: Map<string, unknown>;
};

/**
 * Wraps a constructor so it runs at most once per process, keyed by `name`.
 * Returns a getter, so reading the value stays an explicit act at the call site
 * rather than a module-level side effect.
 */
export const processSingleton =
  <T>(name: string, create: () => T): (() => T) =>
  () => {
    const store = (registry.arenaSingletons ??= new Map<string, unknown>());

    if (!store.has(name)) {
      store.set(name, create());
    }

    return store.get(name) as T;
  };
