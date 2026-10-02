"use client";

import type { DeckFilterView, MemberCard } from "@epilove/contracts";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { api } from "@/lib/rencontre/api.client";
import { Deck, type DeckInitial } from "./deck";
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
  const [filter, setFilter] = useState(initialFilter);
  const [deck, setDeck] = useState({ version: 0, initial });
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [likesLeft, setLikesLeft] = useState(initial.quota.likesLeft);
  const active = isFilterActive(filter);

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

      <Deck
        key={deck.version}
        initial={deck.initial}
        me={me}
        filtersActive={active}
        onQuota={(quota) => setLikesLeft(quota.likesLeft)}
        onOpenFilters={() => setFiltersOpen(true)}
      />

      <FiltersDrawer
        open={filtersOpen}
        filter={filter}
        onClose={() => setFiltersOpen(false)}
        onSaved={async (saved) => {
          setFilter(saved);
          setFiltersOpen(false);
          const next = await api.discovery.deck({ locale: "fr", limit: 8, exclude: [] });
          setDeck((current) => ({ version: current.version + 1, initial: next }));
        }}
      />
    </main>
  );
}
