"use client";

import type { PactStatsView } from "@epilove/contracts";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { api } from "@/lib/rencontre/api.client";
import { contentLocale } from "@/lib/rencontre/locale";

/** "Le Pacte en chiffres" (PAC-04), after the reveal: anonymous aggregates of ten people or more. */
export function PactStats() {
  const t = useTranslations("pact.stats");
  const locale = contentLocale(useLocale());
  const [stats, setStats] = useState<PactStatsView | null>(null);

  useEffect(() => {
    void api.community
      .pactStats({ locale })
      .then(setStats)
      .catch(() => undefined);
  }, [locale]);

  if (!stats?.season || stats.participants === null) {
    return null;
  }
  return (
    <section
      aria-labelledby="pact-stats"
      className="flex flex-col gap-4 rounded-3xl border border-paper/10 p-5"
    >
      <h2 id="pact-stats" className="font-display font-semibold text-xl">
        {t("title")}
      </h2>
      <ul className="flex flex-wrap gap-2 font-mono text-sm">
        <li className="rounded-full bg-paper/10 px-3 py-1">
          {t("participants", { count: stats.participants })}
        </li>
        {stats.matches !== null && (
          <li className="rounded-full bg-paper/10 px-3 py-1">{t("matches", { count: stats.matches })}</li>
        )}
        {stats.crossSchoolPercent !== null && (
          <li className="rounded-full bg-volt/15 px-3 py-1 text-volt">
            {t("crossSchool", { percent: stats.crossSchoolPercent })}
          </li>
        )}
      </ul>
      {stats.facts.length > 0 && (
        <ul className="flex flex-col gap-3">
          {stats.facts.map((fact) => (
            <li key={fact.question} className="flex flex-col gap-1 rounded-2xl bg-paper/[0.04] p-4">
              <span className="text-paper/70 text-sm">{fact.question}</span>
              <span className="font-semibold">
                {t("fact", { percent: fact.percent, option: fact.option })}
              </span>
            </li>
          ))}
        </ul>
      )}
      <p className="text-paper/60 text-xs">{t("threshold")}</p>
    </section>
  );
}
