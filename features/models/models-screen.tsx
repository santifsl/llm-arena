import { ModelBadge } from "@/components/model-badge";
import { CatalogUnavailable } from "@/features/models/catalog-unavailable";
import type { ArenaModel } from "@/features/models/catalog";
import { formatPricePerMillion } from "@/features/models/format";
import { TopBar } from "@/features/shell/top-bar";

/**
 * The whole free-tier catalog, in the order the picker offers it: widest
 * context window first.
 *
 * The context column prints the full number rather than the picker's compact
 * one. This is the page someone opens to compare models properly, so 262,144 is
 * more use here than 262k.
 *
 * The price column reads $0.0000 on every row, and that is a measurement rather
 * than a placeholder: it is OpenRouter's own per-token price multiplied out to
 * a million tokens. Every model in this app is free tier, so an honest zero is
 * exactly what belongs there.
 */
export const ModelsScreen = ({
  models,
}: {
  readonly models: readonly ArenaModel[] | null;
}) => (
  <>
    <TopBar breadcrumb={["Models"]} />

    <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-8">
      <header className="flex flex-col gap-2">
        <h1 className="signage text-3xl">Models</h1>
        <p className="text-sm text-ink-dim">
          Every model the arena can send a prompt to, straight from
          OpenRouter&apos;s catalog. All of them are free tier, so every price
          here is a real zero.
        </p>
      </header>

      {models === null ? (
        <CatalogUnavailable className="rounded-sm border border-rule p-4" />
      ) : (
        <div className="overflow-x-auto rounded-sm border border-rule">
          <table className="w-full min-w-2xl border-collapse text-left">
            <thead>
              <tr className="border-b border-rule">
                <th scope="col" className="eyebrow px-4 py-3 font-normal">
                  Model
                </th>
                <th scope="col" className="eyebrow px-4 py-3 font-normal">
                  Vendor
                </th>
                <th scope="col" className="eyebrow px-4 py-3 font-normal">
                  Context
                </th>
                <th scope="col" className="eyebrow px-4 py-3 font-normal">
                  Per 1M tokens
                </th>
              </tr>
            </thead>
            <tbody>
              {models.map((model) => (
                <tr
                  key={model.id}
                  className="border-b border-rule last:border-b-0"
                >
                  <td className="px-4 py-4">
                    <span className="flex items-center gap-2">
                      <ModelBadge initial={model.initial} size="sm" />
                      <span className="flex min-w-0 flex-col">
                        <span className="truncate text-sm">{model.name}</span>
                        <span className="numeral truncate text-[0.625rem] text-ink-dim">
                          {model.id}
                        </span>
                      </span>
                    </span>
                  </td>
                  <td className="px-4 py-4 text-sm text-ink-dim">
                    {model.vendor}
                  </td>
                  <td className="numeral px-4 py-4 text-sm text-ink-dim">
                    {model.contextTokens.toLocaleString("en-US")}
                  </td>
                  <td className="numeral px-4 py-4 text-sm text-ink-dim">
                    {formatPricePerMillion(model.promptPricePerToken)}
                  </td>
                </tr>
              ))}
              {models.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-sm text-ink-dim">
                    OpenRouter is listing no free models right now. The arena
                    needs at least one, so check back shortly.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  </>
);
