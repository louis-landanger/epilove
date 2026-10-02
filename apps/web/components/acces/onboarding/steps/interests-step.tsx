"use client";

import type { Catalog } from "@epilove/contracts";
import { MAX_INTERESTS, MIN_INTERESTS } from "@epilove/core";
import { Button, TextField } from "@epilove/ui";
import { Check, Search } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { StepShell } from "../step-shell";
import type { StepProps } from "../types";

type Interest = Catalog["interests"][number];

export function InterestsStep({ state, catalog, save, pending, focusTitle }: StepProps) {
  const t = useTranslations("onboarding");
  const locale = useLocale() as "fr" | "en";
  const [selected, setSelected] = useState<string[]>(state.answers.interestIds);
  const [query, setQuery] = useState("");
  const normalized = query.trim().toLocaleLowerCase(locale);

  const groups = useMemo(() => {
    const map = new Map<string, Interest[]>();
    for (const item of catalog.interests) {
      if (normalized && !item.label[locale].toLocaleLowerCase(locale).includes(normalized)) continue;
      map.set(item.category, [...(map.get(item.category) ?? []), item]);
    }
    return [...map.entries()];
  }, [catalog, normalized, locale]);

  const full = selected.length >= MAX_INTERESTS;
  const missing = Math.max(0, MIN_INTERESTS - selected.length);

  function toggle(id: string) {
    setSelected((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : current.length >= MAX_INTERESTS
          ? current
          : [...current, id],
    );
  }

  return (
    <StepShell
      title={t("interests.title")}
      lead={t("interests.lead")}
      focusTitle={focusTitle}
      onSubmit={() => {
        if (missing === 0) void save({ step: "interests", interestIds: selected });
      }}
      actions={
        <>
          <p className="text-center text-paper/60 text-sm" aria-live="polite">
            {missing > 0
              ? t("interests.minimum", { count: missing })
              : t("interests.counter", { count: selected.length })}
          </p>
          <Button type="submit" size="lg" block loading={pending} disabled={missing > 0}>
            {t("continue")}
          </Button>
        </>
      }
    >
      <div className="relative">
        <Search
          className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-paper/50"
          aria-hidden="true"
        />
        <TextField
          label={<span className="sr-only">{t("interests.search")}</span>}
          placeholder={t("interests.search")}
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          inputClassName="pl-11"
        />
      </div>
      {groups.length === 0 ? <p className="text-paper/60">{t("interests.noResults", { query })}</p> : null}
      {groups.map(([category, items]) => (
        <section key={category} className="flex flex-col gap-3" aria-labelledby={`interests-${category}`}>
          <h2
            id={`interests-${category}`}
            className="font-mono text-paper/50 text-xs uppercase tracking-[0.18em]"
          >
            {t.has(`interests.categories.${category}` as "interests.categories.sport")
              ? t(`interests.categories.${category}` as "interests.categories.sport")
              : category}
          </h2>
          <ul className="flex flex-wrap gap-2">
            {items.map((item) => {
              const on = selected.includes(item.id);
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    aria-pressed={on}
                    disabled={!on && full}
                    onClick={() => toggle(item.id)}
                    className="inline-flex items-center gap-1.5 rounded-full border border-paper/15 px-3.5 py-2 text-sm transition-[background-color,border-color,transform] duration-150 hover:border-paper/35 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-volt active:scale-[0.97] disabled:opacity-35 aria-pressed:border-plasma aria-pressed:bg-plasma/15"
                  >
                    {on ? <Check className="size-3.5 text-plasma" aria-hidden="true" /> : null}
                    {item.label[locale]}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </StepShell>
  );
}
