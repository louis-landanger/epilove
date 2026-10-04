"use client";

import type { Catalog } from "@atomes/contracts";
import { MAX_INTERESTS } from "@atomes/core";
import { TextField } from "@atomes/ui";
import { Check, Search } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useMemo, useState } from "react";

type Interest = Catalog["interests"][number];

export interface InterestsPickerProps {
  readonly catalog: Catalog;
  readonly selected: readonly string[];
  readonly onChange: (selected: string[]) => void;
}

/** Interests from the closed catalogue, grouped by category, 10 at most (PRO-04). */
export function InterestsPicker({ catalog, selected, onChange }: InterestsPickerProps) {
  const t = useTranslations("onboarding.interests");
  const locale = useLocale() as "fr" | "en";
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

  function toggle(id: string) {
    if (selected.includes(id)) {
      onChange(selected.filter((item) => item !== id));
    } else if (!full) {
      onChange([...selected, id]);
    }
  }

  return (
    <div className="flex flex-col gap-6">
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
      {groups.length === 0 ? <p className="text-paper/60">{t("noResults", { query })}</p> : null}
      {groups.map(([category, items]) => (
        <section key={category} className="flex flex-col gap-3" aria-labelledby={`interests-${category}`}>
          <h2
            id={`interests-${category}`}
            className="font-mono text-paper/50 text-xs uppercase tracking-[0.18em]"
          >
            {t.has(`categories.${category}` as "categories.sport")
              ? t(`categories.${category}` as "categories.sport")
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
    </div>
  );
}
