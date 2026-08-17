import { z } from "zod";

/**
 * OpenRouter's live catalog, narrowed to the models this app is willing to
 * call. Everything that shows a model, the picker, the chips, the `/models`
 * table, and the stream route's spending gate, reads this one module, so there
 * is no second list to drift.
 *
 * This is also a spending control, not a display concern. The stream route
 * calls OpenRouter with the application's own key, so whatever model id
 * survives validation is billed to us. Without a server-side check, any
 * signed-in person could post `openai/gpt-4o` and spend real money.
 *
 * What counts as free is three tests, not one. OpenRouter encodes the free tier
 * in the id itself, and checked against the live catalog every `:free` variant
 * prices at zero on both prompt and completion while no paid model carries the
 * suffix. Price alone is not enough: a handful of models price at zero without
 * the suffix, and today those are two audio generators and `openrouter/free`,
 * a router that picks some model for you rather than a model you can name.
 * None of them belongs on a screen whose whole point is comparing named models
 * side by side, so a model has to carry the suffix, price at zero, and answer
 * in text.
 */

export type ArenaModel = {
  readonly id: string;
  /** The model's own name, without the vendor prefix or the "(free)" suffix. */
  readonly name: string;
  readonly vendor: string;
  /** The single letter the badge shows, derived rather than invented. */
  readonly initial: string;
  /** What the top provider actually serves, which is the honest number. */
  readonly contextTokens: number;
  readonly promptPricePerToken: number;
};

/** Three at once is the product's rule, and the picker and the arena share it. */
export const MAX_SELECTED_MODELS = 3;

const CATALOG_URL = "https://openrouter.ai/api/v1/models";

/**
 * One request an hour serves every visitor through Next's data cache. The
 * catalog changes on the order of days, and a picker that refetched per render
 * would put a third party in the path of every page load.
 */
const CATALOG_TTL_SECONDS = 3600;

/** A hung catalog must not hang a page render. */
const CATALOG_TIMEOUT_MS = 8000;

const FREE_TIER_MODEL_ID = /^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+:free$/;

/**
 * The cheap, offline half of the free-tier test. It is deliberately
 * conservative, since refusing a free model is a far cheaper mistake than
 * accepting a paid one, and it is the fallback the gate narrows to when the
 * live catalog cannot be reached.
 */
export const isFreeTierModelId = (modelId: string): boolean =>
  FREE_TIER_MODEL_ID.test(modelId);

/** OpenRouter sends prices as per-token decimal strings, not numbers. */
const priceSchema = z
  .string()
  .refine((value) => Number.isFinite(Number(value)))
  .transform(Number);

const entrySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  context_length: z.number().int().positive(),
  architecture: z.object({ output_modalities: z.array(z.string()) }),
  pricing: z.object({ prompt: priceSchema, completion: priceSchema }),
  top_provider: z
    .object({ context_length: z.number().int().positive().nullish() })
    .nullish(),
});

type CatalogEntry = z.infer<typeof entrySchema>;

/** Rows are parsed one by one, so an unfamiliar model is skipped rather than
 * taking the whole list down with it. */
const envelopeSchema = z.object({ data: z.array(z.unknown()) });

const isFreeTierEntry = (entry: CatalogEntry): boolean =>
  isFreeTierModelId(entry.id) &&
  entry.pricing.prompt === 0 &&
  entry.pricing.completion === 0 &&
  entry.architecture.output_modalities.includes("text");

/** `NVIDIA: Nemotron 3 Ultra (free)` is vendor, name, and a suffix worth
 * dropping: every model on these screens is free, so repeating it fifteen times
 * is noise. */
const NAMED_VENDOR = /^([^:]+):\s*(.+)$/;
const FREE_SUFFIX = /\s*\(free\)\s*$/i;

const readVendorAndName = (
  entry: CatalogEntry,
): { readonly vendor: string; readonly name: string } => {
  const withoutSuffix = entry.name.replace(FREE_SUFFIX, "").trim();
  const named = NAMED_VENDOR.exec(withoutSuffix);

  return named === null
    ? { vendor: entry.id.split("/")[0], name: withoutSuffix }
    : { vendor: named[1].trim(), name: named[2].trim() };
};

const toArenaModel = (entry: CatalogEntry): ArenaModel => {
  const { vendor, name } = readVendorAndName(entry);

  return {
    id: entry.id,
    name,
    vendor,
    initial: vendor.slice(0, 1).toUpperCase(),
    // The advertised window and the one the top provider serves already
    // disagree in the live data, and what a provider will actually serve is the
    // honest number to show and to sort by.
    contextTokens: entry.top_provider?.context_length ?? entry.context_length,
    promptPricePerToken: entry.pricing.prompt,
  };
};

const byContextThenName = (a: ArenaModel, b: ArenaModel): number =>
  b.contextTokens - a.contextTokens || a.name.localeCompare(b.name);

/**
 * `null` means the catalog could not be read, which is different from an empty
 * one. Screens turn it into a plain sentence and a retry; they never see the
 * underlying failure.
 */
export const loadArenaCatalog = async (): Promise<
  readonly ArenaModel[] | null
> => {
  const response = await fetch(CATALOG_URL, {
    next: { revalidate: CATALOG_TTL_SECONDS },
    signal: AbortSignal.timeout(CATALOG_TIMEOUT_MS),
  }).catch(() => null);

  if (response === null || !response.ok) return null;

  const envelope = envelopeSchema.safeParse(
    await response.json().catch(() => null),
  );

  if (!envelope.success) return null;

  return envelope.data.data
    .flatMap((row) => {
      const parsed = entrySchema.safeParse(row);

      return parsed.success && isFreeTierEntry(parsed.data)
        ? [toArenaModel(parsed.data)]
        : [];
    })
    .sort(byContextThenName);
};

/**
 * Which models a thread starts with: the first model of each distinct vendor,
 * walking the context-window order, topped up from the rest of the list if
 * there are not enough vendors to fill the row.
 *
 * A flat top three by context window is the simpler rule and is wrong here.
 * Most of the free tier comes from one vendor, so the flat rule can hand a
 * first-time visitor three siblings of the same family, and "watch models that
 * actually differ answer the same prompt" is the entire product.
 */
export const defaultSelectedModelIds = (
  models: readonly ArenaModel[],
): readonly string[] => {
  const firstPerVendor = models.reduce<readonly ArenaModel[]>(
    (picked, model) =>
      picked.length >= MAX_SELECTED_MODELS ||
      picked.some((already) => already.vendor === model.vendor)
        ? picked
        : [...picked, model],
    [],
  );

  const topUp = models.filter((model) => !firstPerVendor.includes(model));

  return [...firstPerVendor, ...topUp]
    .slice(0, MAX_SELECTED_MODELS)
    .map((model) => model.id);
};

export const findArenaModel = (
  models: readonly ArenaModel[],
  modelId: string,
): ArenaModel | undefined => models.find((model) => model.id === modelId);

/**
 * The least a screen needs in order to name a model: the badge letter and a
 * label.
 *
 * An answer card takes this rather than a whole `ArenaModel`, because a stored
 * thread outlives the catalog. OpenRouter delists models, and an answer from a
 * model that is no longer listed still has to render: it is part of a record
 * somebody may have been sent a link to. Everything that would have to be
 * invented for a model the catalog no longer describes, its context window and
 * its price, is deliberately absent from this type, so the fallback below
 * cannot fabricate a measurement.
 */
export type ModelIdentity = {
  readonly initial: string;
  readonly name: string;
};

const UNKNOWN_INITIAL = "?";

/**
 * What is known about a model id, whether or not the catalog still lists it.
 *
 * The alternative, which this replaces, was to skip any answer whose model is
 * missing from the catalog. That was close to harmless while the only reader of
 * a thread was the person who had just made it, and it stopped being harmless
 * the moment a thread became a link a stranger can open a week later: an answer
 * silently disappearing out of a shared record is worse than a card labelled
 * with a raw id. The id is the honest label here, because it is genuinely all
 * that is left to know.
 */
export const modelIdentity = (
  models: readonly ArenaModel[],
  modelId: string,
): ModelIdentity => {
  const listed = findArenaModel(models, modelId);

  if (listed !== undefined) return listed;

  const vendor = modelId.split("/")[0];

  return {
    initial: vendor === "" ? UNKNOWN_INITIAL : vendor.slice(0, 1).toUpperCase(),
    name: modelId,
  };
};

/**
 * The server-side spending gate, in two layers. The suffix has to hold no
 * matter what, and on top of that the id has to be a model the live catalog
 * still lists.
 *
 * If the catalog cannot be reached the gate narrows to the suffix rather than
 * opening: a request must never be allowed through because a fetch failed.
 */
export const isCallableModelId = async (modelId: string): Promise<boolean> => {
  if (!isFreeTierModelId(modelId)) return false;

  const models = await loadArenaCatalog();

  return models === null || models.some((model) => model.id === modelId);
};
