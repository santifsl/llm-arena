"use client";

import { ModelBadge } from "@/components/model-badge";
import { PLACEHOLDER_MODELS } from "@/features/placeholder/data";
import { TopBar } from "@/features/shell/top-bar";

/**
 * Screen only. Feature 5 replaces this list with OpenRouter's live free-tier
 * catalog, which the model picker has to fetch anyway.
 *
 * The price column reads $0.0000 for every row and that is correct, not a
 * placeholder standing in for a real number: every model in this app is free
 * tier. It is shown because it is an honestly measured zero.
 */
export const ModelsScreen = () => (
  <>
    <TopBar breadcrumb={["Models"]} />

    <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-8">
      <header className="flex flex-col gap-2">
        <h1 className="signage text-3xl">Models</h1>
        <p className="text-sm text-ink-dim">
          Every model the arena can send a prompt to. All of them are free tier,
          so every price here is a real zero.
        </p>
      </header>

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
            {PLACEHOLDER_MODELS.map((model) => (
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
                  $0.0000
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  </>
);
