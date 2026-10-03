"use client";

import type { DeckFilterView } from "@epilove/contracts";
import { Sheet } from "@epilove/ui";
import { useTranslations } from "next-intl";
import { useEffect, useId, useState } from "react";
import { api } from "@/lib/api-client";
import { SchoolGlyph } from "./school";

const INTENTIONS = ["relationship", "see_what_happens", "friendship"] as const;
const YEARS = [2027, 2028, 2029, 2030, 2031] as const;

export const EMPTY_FILTER: DeckFilterView = {
  mode: "all",
  schoolSlugs: [],
  graduationYears: [],
  intentions: [],
  ageMin: null,
  ageMax: null,
};

export const isFilterActive = (filter: DeckFilterView) =>
  filter.mode !== "all" ||
  filter.schoolSlugs.length > 0 ||
  filter.graduationYears.length > 0 ||
  filter.intentions.length > 0 ||
  filter.ageMin !== null ||
  filter.ageMax !== null;

function toggle<T>(list: readonly T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

/** Deck filters (DEC-06), in a drawer. Saved on the server, applied to the next cards. */
export function FiltersDrawer({
  open,
  filter,
  onClose,
  onSaved,
}: {
  open: boolean;
  filter: DeckFilterView;
  onClose: () => void;
  onSaved: (filter: DeckFilterView) => void;
}) {
  const t = useTranslations("discovery.filtersDrawer");
  const titleId = useId();
  const [draft, setDraft] = useState(filter);
  const [schools, setSchools] = useState<{ slug: string; name: string }[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setDraft(filter);
      api.discovery
        .filters()
        .then((result) => setSchools(result.schools))
        .catch(() => setSchools([]));
    }
  }, [open, filter]);

  const chip = (selected: boolean) =>
    `flex min-h-11 cursor-pointer items-center gap-2 rounded-full border px-4 py-2 text-sm transition-colors has-focus-visible:outline-2 has-focus-visible:outline-volt ${
      selected ? "border-volt bg-volt/10" : "border-paper/15 hover:border-paper/40"
    }`;

  return (
    <Sheet open={open} onClose={onClose} labelledBy={titleId}>
      <div className="flex items-center justify-between">
        <h2 id={titleId} className="font-display font-semibold text-2xl">
          {t("title")}
        </h2>
        <button
          type="button"
          onClick={() => setDraft(EMPTY_FILTER)}
          className="text-paper/60 text-sm underline"
        >
          {t("reset")}
        </button>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 font-semibold text-sm">{t("mode")}</legend>
        <div className="flex flex-wrap gap-2">
          {(["all", "love", "friends"] as const).map((mode) => (
            <label key={mode} className={chip(draft.mode === mode)}>
              <input
                type="radio"
                name="deck-mode"
                className="sr-only"
                checked={draft.mode === mode}
                onChange={() => setDraft({ ...draft, mode })}
              />
              {t(mode === "all" ? "modeAll" : mode === "love" ? "modeLove" : "modeFriends")}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 font-semibold text-sm">{t("schools")}</legend>
        <div className="flex flex-wrap gap-2">
          {schools.map((school) => (
            <label key={school.slug} className={chip(draft.schoolSlugs.includes(school.slug))}>
              <input
                type="checkbox"
                className="sr-only"
                checked={draft.schoolSlugs.includes(school.slug)}
                onChange={() => setDraft({ ...draft, schoolSlugs: toggle(draft.schoolSlugs, school.slug) })}
              />
              <SchoolGlyph slug={school.slug} />
              {school.name}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 font-semibold text-sm">{t("years")}</legend>
        <div className="flex flex-wrap gap-2">
          {YEARS.map((year) => (
            <label key={year} className={chip(draft.graduationYears.includes(year))}>
              <input
                type="checkbox"
                className="sr-only"
                checked={draft.graduationYears.includes(year)}
                onChange={() => setDraft({ ...draft, graduationYears: toggle(draft.graduationYears, year) })}
              />
              <span className="font-mono">{year}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 font-semibold text-sm">{t("intentions")}</legend>
        <div className="flex flex-wrap gap-2">
          {INTENTIONS.map((intention) => (
            <label key={intention} className={chip(draft.intentions.includes(intention))}>
              <input
                type="checkbox"
                className="sr-only"
                checked={draft.intentions.includes(intention)}
                onChange={() => setDraft({ ...draft, intentions: toggle(draft.intentions, intention) })}
              />
              {t(`intention.${intention}`)}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 font-semibold text-sm">{t("age")}</legend>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm">
            {t("ageMin")}
            <input
              type="number"
              min={18}
              max={99}
              inputMode="numeric"
              value={draft.ageMin ?? ""}
              onChange={(event) =>
                setDraft({ ...draft, ageMin: event.target.value ? Number(event.target.value) : null })
              }
              className="w-20 rounded-xl border border-paper/20 bg-transparent px-3 py-2"
            />
          </label>
          <label className="flex items-center gap-2 text-sm">
            {t("ageMax")}
            <input
              type="number"
              min={18}
              max={99}
              inputMode="numeric"
              value={draft.ageMax ?? ""}
              onChange={(event) =>
                setDraft({ ...draft, ageMax: event.target.value ? Number(event.target.value) : null })
              }
              className="w-20 rounded-xl border border-paper/20 bg-transparent px-3 py-2"
            />
          </label>
        </div>
        <p className="text-paper/60 text-xs">{t("ageHint")}</p>
      </fieldset>

      <div className="flex gap-3">
        <button type="button" onClick={onClose} className="rounded-full border border-paper/20 px-5 py-3">
          {t("close")}
        </button>
        <button
          type="button"
          disabled={saving}
          onClick={async () => {
            setSaving(true);
            try {
              const clamp = (v: number | null) =>
                v === null ? null : Math.max(18, Math.min(99, Math.round(v)));
              onSaved(
                await api.discovery.saveFilters({
                  ...draft,
                  ageMin: clamp(draft.ageMin),
                  ageMax: clamp(draft.ageMax),
                }),
              );
            } finally {
              setSaving(false);
            }
          }}
          className="ml-auto rounded-full bg-paper px-6 py-3 font-semibold text-ink disabled:opacity-50"
        >
          {t("apply")}
        </button>
      </div>
    </Sheet>
  );
}
