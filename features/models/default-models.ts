import { z } from "zod";

import { analytics, reportServerException } from "@/features/analytics/server";

import {
  defaultSelectedModelIds,
  MAX_SELECTED_MODELS,
  type ArenaModel,
} from "./catalog";

/**
 * Which three models a first-time visitor watches race.
 *
 * This is the highest-leverage constant in the product and it did not look like
 * one. Almost nobody changes the default trio before sending their first
 * prompt, so whatever is chosen here is what most votes are cast on, and the
 * leaderboard's denominator is therefore decided by this function rather than
 * by anything a person did. Changing it to find out what a better opening trio
 * looks like should not need a deploy, so it is a flag.
 *
 * `defaultSelectedModelIds` stays the answer whenever the flag has nothing
 * usable to say, and that is most of the time: no flag configured, PostHog
 * unreachable, a payload naming a model the catalog does not list. Its rule,
 * one model per vendor walking the context-window order, is a good default and
 * this only exists to try to beat it.
 */

/** The flag's key in PostHog. A JSON payload holding a list of model ids. */
const FLAG_KEY = "arena-default-models";

const payloadSchema = z.array(z.string().min(1)).min(1);

/**
 * Reads the flag, and is never the reason a page does not render.
 *
 * The evaluation is a network call, and it happens during a server render that
 * cannot finish without it, so it is bounded twice over: the client sets a one
 * second budget with no retry, in `features/analytics/server.ts`, and anything
 * that budget cuts off arrives here as a rejection and becomes the fallback. A
 * flag that is slow, misconfigured, or down costs a second at worst, and never
 * the page.
 */
export const resolveDefaultModelIds = async (
  catalog: readonly ArenaModel[] | null,
  /**
   * Who to evaluate for. The Clerk user id when somebody is signed in, so a
   * person keeps the same trio across their own sessions and devices.
   * Otherwise `null`, and everybody anonymous gets the fallback: rolling out a
   * percentage against an id invented per request would put a different trio in
   * front of the same visitor on every reload.
   */
  distinctId: string | null,
): Promise<readonly string[]> => {
  const fallback = defaultSelectedModelIds(catalog ?? []);

  if (catalog === null || distinctId === null) return fallback;

  const payload = await analytics()
    .getFeatureFlagPayload(FLAG_KEY, distinctId)
    .catch((error: unknown) => {
      reportServerException("could not read the default-models flag", error);

      return undefined;
    });

  if (payload === undefined) return fallback;

  const parsed = payloadSchema.safeParse(payload);

  if (!parsed.success) return fallback;

  // A flag naming a model OpenRouter has dropped would put a chip on screen
  // that cannot be sent a prompt, and the submit action would refuse the whole
  // turn for a model the person never chose. Unlisted ids are dropped, and if
  // that leaves nothing the catalog's own rule decides instead.
  // Capped as well as filtered: three at once is the arena's limit everywhere
  // else, and a longer list here would put a fourth chip on screen that the
  // composer would then refuse to submit.
  const listed = parsed.data
    .filter((id) => catalog.some((model) => model.id === id))
    .slice(0, MAX_SELECTED_MODELS);

  return listed.length === 0 ? fallback : listed;
};
