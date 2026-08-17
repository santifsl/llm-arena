"use client";

import { ArrowUp, Plus, X } from "lucide-react";
import { useState } from "react";

import { ModelBadge } from "@/components/model-badge";
import { posthog } from "@/features/analytics/posthog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  MAX_SELECTED_MODELS,
  modelIdentity,
  type ArenaModel,
} from "@/features/models/catalog";
import { formatContextTokens } from "@/features/models/format";

type ComposerProps = {
  /** The live free-tier catalog, fetched on the server and passed down. */
  readonly models: readonly ArenaModel[];
  readonly selectedModelIds: readonly string[];
  /** True while models are still answering, which is when nothing may be sent. */
  readonly busy: boolean;
  /** Resolves true when the prompt was accepted, which is when the box clears. */
  readonly onSubmit: (prompt: string) => Promise<boolean>;
  readonly onAdd: (modelId: string) => void;
  readonly onRemove: (modelId: string) => void;
};

export const Composer = ({
  models,
  selectedModelIds,
  busy,
  onSubmit,
  onAdd,
  onRemove,
}: ComposerProps) => {
  const [prompt, setPrompt] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [sending, setSending] = useState(false);

  const ready = prompt.trim() !== "" && selectedModelIds.length > 0;
  const blocked = busy || sending;

  const send = async () => {
    if (!ready || blocked) return;

    setSending(true);
    const accepted = await onSubmit(prompt);
    setSending(false);

    if (accepted) setPrompt("");
  };

  const full = selectedModelIds.length >= MAX_SELECTED_MODELS;
  const unselected = models.filter(
    (model) => !selectedModelIds.includes(model.id),
  );

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void send();
      }}
      className="rounded-sm border border-rule bg-surface focus-within:border-rust"
    >
      <label htmlFor="prompt" className="sr-only">
        Your prompt
      </label>
      <textarea
        id="prompt"
        rows={3}
        value={prompt}
        onChange={(event) => setPrompt(event.target.value)}
        onKeyDown={(event) => {
          if (event.key !== "Enter" || event.shiftKey) return;
          event.preventDefault();
          void send();
        }}
        placeholder="Ask anything. Enter to send, shift + enter for a new line."
        className="w-full resize-none bg-transparent px-3 py-3 text-sm outline-none placeholder:text-ink-dim"
      />

      <div className="flex flex-wrap items-center gap-2 border-t border-rule px-3 py-2.5">
        <ul className="flex flex-wrap items-center gap-2">
          {/* A chip is rendered even for a model the catalog no longer lists,
              because an old thread can carry one. Dropping the chip would leave
              a person unable to remove the very model that is making their
              prompt refused, with nothing on screen explaining why. */}
          {selectedModelIds.map((modelId) => {
            const model = modelIdentity(models, modelId);
            return (
              <li key={modelId}>
                <span className="inline-flex items-center gap-1.5 rounded-sm border border-rule py-1 pr-1 pl-1.5 text-xs">
                  <ModelBadge initial={model.initial} size="sm" />
                  <span className="max-w-36 truncate">{model.name}</span>
                  <button
                    type="button"
                    onClick={() => onRemove(modelId)}
                    aria-label={`Remove ${model.name}`}
                    className="flex size-5 items-center justify-center rounded-sm text-ink-dim hover:text-fail"
                  >
                    <X className="size-3.5" aria-hidden />
                  </button>
                </span>
              </li>
            );
          })}
        </ul>

        <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              disabled={full}
              title={
                full ? `Three models at once is the limit.` : "Add a model"
              }
              className="inline-flex items-center gap-1.5 rounded-sm border border-rule px-2 py-1.5 text-xs text-ink-dim hover:border-rust hover:text-ink disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-rule"
            >
              <Plus className="size-3.5" aria-hidden />
              Add model
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-76 p-1">
            <p className="eyebrow px-2 py-1.5">
              Free models, widest context first
            </p>
            {/* The free tier runs to fifteen models, most of them from one
                vendor, so the list scrolls and every row names its vendor. */}
            <ul className="flex max-h-72 flex-col overflow-y-auto">
              {unselected.map((model) => (
                <li key={model.id}>
                  <button
                    type="button"
                    onClick={() => {
                      // The one event in the funnel that never reaches a
                      // server: choosing a model happens entirely in the
                      // browser, so it is captured where it happens.
                      posthog.capture("model_selected", {
                        model_id: model.id,
                        vendor: model.vendor,
                        context_tokens: model.contextTokens,
                      });
                      onAdd(model.id);
                      setPickerOpen(false);
                    }}
                    className="flex w-full items-center gap-2 rounded-sm px-2 py-2 text-left text-sm hover:bg-surface-raised"
                  >
                    <ModelBadge initial={model.initial} size="sm" />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate">{model.name}</span>
                      <span className="truncate text-[0.625rem] text-ink-dim">
                        {model.vendor}
                      </span>
                    </span>
                    <span className="numeral shrink-0 text-[0.625rem] text-ink-dim">
                      {formatContextTokens(model.contextTokens)}
                    </span>
                  </button>
                </li>
              ))}
              {unselected.length === 0 && (
                <li className="px-2 py-2 text-sm text-ink-dim">
                  Every model is already in this thread.
                </li>
              )}
            </ul>
          </PopoverContent>
        </Popover>

        <button
          type="submit"
          disabled={!ready || blocked}
          aria-label="Send the prompt"
          title={busy ? "Wait for the models to finish answering." : undefined}
          className="ml-auto flex size-9 items-center justify-center rounded-sm bg-rust text-rust-ink hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <ArrowUp className="size-4" aria-hidden />
        </button>
      </div>
    </form>
  );
};
