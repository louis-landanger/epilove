"use client";

import type { Catalog } from "@epilove/contracts";
import { normalizePromptAnswer, PROMPT_ANSWER_COUNT, PROMPT_ANSWER_MAX_LENGTH } from "@epilove/core";
import { Button, Dialog, TextAreaField, TextField } from "@epilove/ui";
import { Plus, RefreshCw, Search } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { StepShell } from "../step-shell";
import type { StepProps } from "../types";

type Prompt = Catalog["prompts"][number];
interface Slot {
  readonly key: string;
  promptId: string | null;
  text: string;
}

function emptySlots(answers: StepProps["state"]["answers"]["promptAnswers"]): Slot[] {
  return Array.from({ length: PROMPT_ANSWER_COUNT }, (_, index) => ({
    key: `slot-${index}`,
    promptId: answers[index]?.promptId ?? null,
    text: answers[index]?.text ?? "",
  }));
}

export function PromptsStep({ state, catalog, save, pending, focusTitle }: StepProps) {
  const t = useTranslations("onboarding");
  const locale = useLocale() as "fr" | "en";
  const [slots, setSlots] = useState<Slot[]>(() => emptySlots(state.answers.promptAnswers));
  const [picking, setPicking] = useState<number | null>(null);
  const [invalid, setInvalid] = useState<Set<number>>(new Set());
  const byId = useMemo(() => new Map(catalog.prompts.map((prompt) => [prompt.id, prompt])), [catalog]);

  const complete = slots.every((slot) => slot.promptId && normalizePromptAnswer(slot.text));

  async function submit() {
    const bad = new Set(
      slots.flatMap((slot, index) => (slot.promptId && normalizePromptAnswer(slot.text) ? [] : [index])),
    );
    setInvalid(bad);
    if (bad.size > 0) {
      return;
    }
    const result = await save({
      step: "prompts",
      answers: slots.map((slot) => ({ promptId: slot.promptId ?? "", text: slot.text })),
    });
    if (!result.ok && result.field?.startsWith("answers.")) {
      setInvalid(new Set([Number(result.field.split(".")[1])]));
    }
  }

  return (
    <StepShell
      title={t("prompts.title")}
      lead={t("prompts.lead")}
      focusTitle={focusTitle}
      onSubmit={() => void submit()}
      actions={
        <Button type="submit" size="lg" block loading={pending} disabled={!complete}>
          {t("continue")}
        </Button>
      }
    >
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
                  {t("prompts.slot", { position: index + 1 })}
                </p>
                {prompt ? (
                  <button
                    type="button"
                    onClick={() => setPicking(index)}
                    className="-m-2 inline-flex items-center gap-1.5 rounded-full p-2 text-paper/60 text-xs hover:text-paper focus-visible:outline-2 focus-visible:outline-volt"
                  >
                    <RefreshCw className="size-3.5" aria-hidden="true" />
                    {t("prompts.change")}
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
                  onChange={(event) => {
                    const text = event.target.value;
                    setSlots((current) =>
                      current.map((item, position) => (position === index ? { ...item, text } : item)),
                    );
                    setInvalid((current) => {
                      const next = new Set(current);
                      next.delete(index);
                      return next;
                    });
                  }}
                  error={invalid.has(index) ? t("prompts.answerRequired") : null}
                />
              ) : (
                <Button
                  variant="outline"
                  onClick={() => setPicking(index)}
                  leadingIcon={<Plus className="size-4" aria-hidden="true" />}
                >
                  {t("prompts.choose")}
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
          setSlots((current) =>
            current.map((item, position) => (position === picking ? { ...item, promptId } : item)),
          );
          setPicking(null);
        }}
      />
    </StepShell>
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
