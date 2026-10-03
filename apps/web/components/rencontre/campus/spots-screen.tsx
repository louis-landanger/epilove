"use client";

import type { SpotView } from "@epilove/contracts";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { SpotsMap } from "./spots-map";

const KINDS = ["park", "square", "riverbank", "viewpoint"] as const;

/** Spots (IRL-02): public places for a first date, on a map and in a list. */
export function SpotsScreen({ spots }: { spots: SpotView[] }) {
  const t = useTranslations("spots");
  const [kind, setKind] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const shown = kind ? spots.filter((s) => s.kind === kind) : spots;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col gap-5 px-4 pt-6 pb-10">
      <header className="flex flex-col gap-2">
        <Link href="/campus" className="self-start text-paper/70 text-sm underline-offset-4 hover:underline">
          {t("back")}
        </Link>
        <h1 className="font-display font-semibold text-3xl tracking-tight">{t("title")}</h1>
        <p className="text-paper/75">{t("lead")}</p>
      </header>

      <SpotsMap spots={shown} selected={selected} onSelect={setSelected} />

      <fieldset className="flex flex-wrap gap-2">
        <legend className="sr-only">{t("filter")}</legend>
        <button
          type="button"
          aria-pressed={kind === null}
          onClick={() => setKind(null)}
          className="rounded-full border border-paper/20 px-3 py-1.5 text-sm aria-pressed:border-volt aria-pressed:text-volt"
        >
          {t("all")}
        </button>
        {KINDS.map((value) => (
          <button
            key={value}
            type="button"
            aria-pressed={kind === value}
            onClick={() => setKind(value)}
            className="rounded-full border border-paper/20 px-3 py-1.5 text-sm aria-pressed:border-volt aria-pressed:text-volt"
          >
            {t(`kinds.${value}`)}
          </button>
        ))}
      </fieldset>

      <ol className="flex flex-col gap-3">
        {shown.map((spot, index) => (
          <li key={spot.id}>
            <button
              type="button"
              onClick={() => setSelected(spot.id)}
              aria-current={selected === spot.id ? "true" : undefined}
              className="flex w-full items-start gap-4 rounded-3xl border border-paper/10 bg-paper/[0.03] p-4 text-left transition hover:border-volt/50 aria-[current=true]:border-volt"
            >
              <span className="grid size-8 shrink-0 place-items-center rounded-full bg-volt font-mono font-semibold text-ink text-sm">
                {index + 1}
              </span>
              <span className="flex flex-col gap-1">
                <span className="font-semibold">{spot.name}</span>
                <span className="font-mono text-paper/70 text-xs uppercase tracking-wider">
                  {t(`kinds.${spot.kind}` as "kinds.park")} · {t(`areas.${spot.area}` as "areas.vaise")}
                </span>
                <span className="text-paper/75 text-sm">{spot.description}</span>
              </span>
            </button>
          </li>
        ))}
      </ol>
      <p className="text-paper/60 text-xs">{t("publicOnly")}</p>
    </main>
  );
}
