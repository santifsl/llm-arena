"use client";

import { ArrowUp, Plus, X } from "lucide-react";
import { useState } from "react";

import { ModelBadge } from "@/components/model-badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  PLACEHOLDER_MODELS,
  findPlaceholderModel,
} from "@/features/placeholder/data";

export const MAX_MODELS = 3;

type ComposerProps = {
  readonly selectedModelIds: readonly string[];
  readonly onAdd: (modelId: string) => void;
  readonly onRemove: (modelId: string) => void;
};

export const Composer = ({
  selectedModelIds,
  onAdd,
  onRemove,
}: ComposerProps) => {
  const [prompt, setPrompt] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);

  const full = selectedModelIds.length >= MAX_MODELS;
  const unselected = PLACEHOLDER_MODELS.filter(
    (model) => !selectedModelIds.includes(model.id),
  );

  return (
    <form
      // Nothing is sent yet; feature 6 owns what this does.
      onSubmit={(event) => event.preventDefault()}
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
        placeholder="Ask anything. Enter to send, shift + enter for a new line."
        className="w-full resize-none bg-transparent px-3 py-3 text-sm outline-none placeholder:text-ink-dim"
      />

      <div className="flex flex-wrap items-center gap-2 border-t border-rule px-3 py-2.5">
        <ul className="flex flex-wrap items-center gap-2">
          {selectedModelIds.map((modelId) => {
            const model = findPlaceholderModel(modelId);
            if (model === undefined) return null;
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
          <PopoverContent align="start" className="w-72 p-1">
            <p className="eyebrow px-2 py-1.5">Free models</p>
            <ul className="flex flex-col">
              {unselected.map((model) => (
                <li key={model.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onAdd(model.id);
                      setPickerOpen(false);
                    }}
                    className="flex w-full items-center gap-2 rounded-sm px-2 py-2 text-left text-sm hover:bg-surface-raised"
                  >
                    <ModelBadge initial={model.initial} size="sm" />
                    <span className="min-w-0 flex-1 truncate">
                      {model.name}
                    </span>
                    <span className="numeral shrink-0 text-[0.625rem] text-ink-dim">
                      {Math.round(model.contextTokens / 1000)}k
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
          disabled={prompt.trim() === "" || selectedModelIds.length === 0}
          aria-label="Send the prompt"
          className="ml-auto flex size-9 items-center justify-center rounded-sm bg-rust text-rust-ink hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <ArrowUp className="size-4" aria-hidden />
        </button>
      </div>
    </form>
  );
};
