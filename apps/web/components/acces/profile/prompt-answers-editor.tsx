"use client";

import type { Catalog } from "@epilove/contracts";
import { normalizePromptAnswer, PROMPT_ANSWER_COUNT, PROMPT_ANSWER_MAX_LENGTH } from "@epilove/core";
import { Button, Dialog, TextAreaField, TextField } from "@epilove/ui";
import { Plus, RefreshCw, Search } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useMemo, useState } from "react";

type Prompt = Catalog["prompts"][number];

export interface PromptSlot {
  readonly key: string;
  readonly promptId: string | null;
  readonly text: string;
}

export function promptSlots(answers: readonly { promptId: string; text: string }[]): PromptSlot[] {
  return Array.from({ length: PROMPT_ANSWER_COUNT }, (_, index) => ({
    key: `slot-${index}`,
    promptId: answers[index]?.promptId ?? null,
    text: answers[index]?.text ?? "",
  }));
}

/** Indexes of the slots that cannot be saved yet. */
export function invalidSlots(slots: readonly PromptSlot[]): Set<number> {
  return new Set(
    slots.flatMap((slot, index) => (slot.promptId && normalizePromptAnswer(slot.text) ? [] : [index])),
  );
}

export interface PromptAnswersEditorProps {
  readonly catalog: Catalog;
  readonly slots: readonly PromptSlot[];
  readonly onChange: (slots: PromptSlot[]) => void;
  readonly invalid: ReadonlySet<number>;
}

/** Three prompts picked from the catalogue, answered in 200 characters (PRO-02). */
export function PromptAnswersEditor({ catalog, slots, onChange, invalid }: PromptAnswersEditorProps) {
  const t = useTranslations("onboarding.prompts");
  const locale = useLocale() as "fr" | "en";
  const [picking, setPicking] = useState<number | null>(null);
  const byId = useMemo(() => new Map(catalog.prompts.map((prompt) => [prompt.id, prompt])), [catalog]);

  const update = (index: number, patch: Partial<PromptSlot>) =>
    onChange(slots.map((slot, position) => (position === index ? { ...slot, ...patch } : slot)));

  return (
    <>
      <ol className="flex flex-col gap-4">
        {slots.map((slot, index) => {
          const prompt = slot.promptId ? byId.get(slot.promptId) : undefined;
          return (
            <li
              key={slot.key}
              className="flex flex-col gap-3 rounded-3xl border border-paper/10 bg-paper/[0.03] p-5"
            >
              <div className="flex items-start justify-between gap-3">
                <p className="font-mono text-paper/50 text-xs uppercase tracking-[0.18em]">
                  {t("slot", { position: index + 1 })}
                </p>
                {prompt ? (
                  <button
                    type="button"
                    onClick={() => setPicking(index)}
                    className="-m-2 inline-flex items-center gap-1.5 rounded-full p-2 text-paper/60 text-xs hover:text-paper focus-visible:outline-2 focus-visible:outline-volt"
                  >
                    <RefreshCw className="size-3.5" aria-hidden="true" />
                    {t("change")}
                  </button>
                ) : null}
              </div>
              {prompt ? (
                <TextAreaField
                  label={
                    <span className="font-display font-semibold text-paper text-xl">
                      {prompt.text[locale]}
                    </span>
                  }
                  maxLength={PROMPT_ANSWER_MAX_LENGTH}
                  rows={3}
                  value={slot.text}
                  onChange={(event) => update(index, { text: event.target.value })}
                  error={invalid.has(index) ? t("answerRequired") : null}
                />
              ) : (
                <Button
                  variant="outline"
                  onClick={() => setPicking(index)}
                  leadingIcon={<Plus className="size-4" aria-hidden="true" />}
                >
                  {t("choose")}
                </Button>
              )}
            </li>
          );
        })}
      </ol>
      <PromptPicker
        open={picking !== null}
        prompts={catalog.prompts}
        taken={
          new Set(slots.flatMap((slot, index) => (slot.promptId && index !== picking ? [slot.promptId] : [])))
        }
        onClose={() => setPicking(null)}
        onPick={(promptId) => {
          if (picking !== null) update(picking, { promptId });
          setPicking(null);
        }}
      />
    </>
  );
}

function PromptPicker({
  open,
  prompts,
  taken,
  onClose,
  onPick,
}: {
  open: boolean;
  prompts: readonly Prompt[];
  taken: ReadonlySet<string>;
  onClose: () => void;
  onPick: (promptId: string) => void;
}) {
  const t = useTranslations("onboarding.prompts");
  const locale = useLocale() as "fr" | "en";
  const [query, setQuery] = useState("");
  const normalized = query.trim().toLocaleLowerCase(locale);
  const groups = useMemo(() => {
    const map = new Map<string, Prompt[]>();
    for (const prompt of prompts) {
      if (taken.has(prompt.id)) continue;
      if (normalized && !prompt.text[locale].toLocaleLowerCase(locale).includes(normalized)) continue;
      map.set(prompt.category, [...(map.get(prompt.category) ?? []), prompt]);
    }
    return [...map.entries()];
  }, [prompts, taken, normalized, locale]);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title={t("pickerTitle")}
      className="sm:w-[min(40rem,calc(100vw-2rem))]"
    >
      <div className="flex flex-col gap-5">
        <div className="relative">
          <Search
            className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-paper/50"
            aria-hidden="true"
          />
          <TextField
            label={<span className="sr-only">{t("search")}</span>}
            placeholder={t("search")}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            inputClassName="pl-11"
          />
        </div>
        {groups.map(([category, items]) => (
          <section key={category} className="flex flex-col gap-2">
            <h3 className="font-mono text-paper/50 text-xs uppercase tracking-[0.18em]">
              {t.has(`categories.${category}` as "categories.campus")
                ? t(`categories.${category}` as "categories.campus")
                : category}
            </h3>
            <ul className="flex flex-col gap-1">
              {items.map((prompt) => (
                <li key={prompt.id}>
                  <button
                    type="button"
                    onClick={() => onPick(prompt.id)}
                    className="w-full rounded-2xl px-4 py-3 text-left text-paper transition-colors hover:bg-paper/10 focus-visible:outline-2 focus-visible:outline-volt"
                  >
                    {prompt.text[locale]}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </Dialog>
  );
}
