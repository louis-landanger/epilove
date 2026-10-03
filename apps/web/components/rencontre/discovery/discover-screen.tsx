"use client";

import type { DeckFilterView, MemberCard } from "@epilove/contracts";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { api } from "@/lib/rencontre/api.client";
import { contentLocale } from "@/lib/rencontre/locale";
import { Deck, type DeckInitial } from "./deck";
import { DropHeader } from "./drop-header";
import { FiltersDrawer, isFilterActive } from "./filters-drawer";

/** "Découvrir" tab: header (quota, filters) and the deck. */
export function DiscoverScreen({
  initial,
  me,
  filter: initialFilter,
}: {
  initial: DeckInitial;
  me: MemberCard | null;
  filter: DeckFilterView;
}) {
  const t = useTranslations("discovery");
  const locale = contentLocale(useLocale());
  const [filter, setFilter] = useState(initialFilter);
  const [deck, setDeck] = useState({ version: 0, initial });
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [likesLeft, setLikesLeft] = useState(initial.quota.likesLeft);
  const [blind, setBlind] = useState(false);
  const [switching, setSwitching] = useState(false);
  const active = isFilterActive(filter);
  const evening = deck.initial.blindEvening ?? initial.blindEvening;

  // Blind mode (DEC-10): one evening a week, a deck of words only.
  const toggleBlind = async () => {
    setSwitching(true);
    try {
      const next = await api.discovery.deck({ locale, limit: 8, exclude: [], blind: !blind });
      setBlind(!blind);
      setDeck((current) => ({ version: current.version + 1, initial: next }));
    } catch {
      // The evening may just have ended: back to the usual deck.
      const next = await api.discovery.deck({ locale, limit: 8, exclude: [] }).catch(() => null);
      setBlind(false);
      if (next) {
        setDeck((current) => ({ version: current.version + 1, initial: next }));
      }
    } finally {
      setSwitching(false);
    }
  };

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-xl flex-col gap-5 px-4 pt-6 pb-8">
      <header className="flex items-center gap-3">
        <h1 className="mr-auto font-display font-semibold text-3xl tracking-tight">{t("title")}</h1>
        <p
          className="whitespace-nowrap font-mono text-paper/70 text-xs"
          title={t("quotaHelp")}
          aria-live="polite"
        >
          {t("quota", { count: likesLeft })}
        </p>
        <button
          type="button"
          onClick={() => setFiltersOpen(true)}
          className={`flex items-center gap-2 rounded-full border px-4 py-2 text-sm ${
            active ? "border-volt text-volt" : "border-paper/20"
          }`}
        >
          <svg
            viewBox="0 0 24 24"
            className="size-4"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            aria-hidden="true"
          >
            <path d="M4 6h16M7 12h10M10 18h4" strokeLinecap="round" />
          </svg>
          {active ? t("filtersActive") : t("filters")}
        </button>
      </header>

      {evening?.active && (
        <section
          aria-labelledby="blind-title"
          className="flex flex-wrap items-center gap-3 rounded-3xl border border-plasma/40 bg-plasma/10 px-4 py-3"
        >
          <div className="mr-auto flex min-w-0 flex-col">
            <h2 id="blind-title" className="font-semibold">
              {t("blind.title")}
            </h2>
            <p className="text-paper/75 text-sm">{blind ? t("blind.on") : t("blind.lead")}</p>
          </div>
          <button
            type="button"
            disabled={switching}
            aria-pressed={blind}
            onClick={() => void toggleBlind()}
            className="rounded-full border border-plasma/60 px-4 py-2 font-semibold text-sm disabled:opacity-50 aria-pressed:bg-plasma aria-pressed:text-ink"
          >
            {blind ? t("blind.leave") : t("blind.enter")}
          </button>
        </section>
      )}

      {!blind && <DropHeader />}

      <Deck
        key={deck.version}
        initial={deck.initial}
        me={me}
        filtersActive={active}
        onQuota={(quota) => setLikesLeft(quota.likesLeft)}
        onOpenFilters={() => setFiltersOpen(true)}
        blind={blind}
      />

      <FiltersDrawer
        open={filtersOpen}
        filter={filter}
        onClose={() => setFiltersOpen(false)}
        onSaved={async (saved) => {
          setFilter(saved);
          setFiltersOpen(false);
          const next = await api.discovery.deck({ locale, limit: 8, exclude: [], blind });
          setDeck((current) => ({ version: current.version + 1, initial: next }));
        }}
      />
    </main>
  );
}
