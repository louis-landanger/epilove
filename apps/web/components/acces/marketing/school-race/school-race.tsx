"use client";

import type { SchoolRaceStanding, WaitlistStats } from "@atomes/contracts";
import { SCHOOLS, type SchoolSlug } from "@atomes/core";
import { schoolColors } from "@atomes/tokens";
import { useFormatter, useTranslations } from "next-intl";
import { type CSSProperties, useEffect, useRef, useState } from "react";
import { SchoolGlyph } from "../school-glyph";
import { useWaitlistStats } from "../stats-store";
import { tubeLevel, tubeScale } from "./scale";
import { useTweenedNumber } from "./use-tweened-number";

const EMPTY: readonly SchoolRaceStanding[] = SCHOOLS.map((school) => ({
  slug: school.slug,
  name: school.name,
  count: 0,
  headcount: 1,
  share: 0,
  rank: 1,
}));

function Tube({
  standing,
  slot,
  level,
  leader,
}: {
  standing: SchoolRaceStanding;
  slot: number;
  level: number;
  leader: boolean;
}) {
  const format = useFormatter();
  const t = useTranslations("marketing.race");
  const order = SCHOOLS.findIndex((school) => school.slug === standing.slug);
  const share = useTweenedNumber(standing.share);
  const style = {
    "--school": schoolColors[standing.slug],
    "--level": level,
    transform: `translateX(${(slot - order) * 100}%)`,
  } as CSSProperties;

  return (
    <div
      className="tube-slot"
      style={style}
      data-tube={standing.slug}
      data-leader={leader ? "true" : undefined}
    >
      <div className="flex h-7 items-end justify-center">
        {leader ? (
          <span className="rounded-full bg-volt px-2 py-0.5 font-mono font-semibold text-[0.6rem] text-ink uppercase tracking-[0.14em]">
            {t("leader")}
          </span>
        ) : (
          <span className="font-mono text-paper/60 text-xs">
            {standing.count > 0 ? `#${standing.rank}` : "–"}
          </span>
        )}
      </div>
      <div className="tube">
        <span className="tube-rim" />
        <div className="tube-glass">
          <div className="tube-liquid">
            <svg aria-hidden="true" className="tube-wave" viewBox="0 0 120 20" preserveAspectRatio="none">
              <path d="M0 10 Q 15 2 30 10 T 60 10 T 90 10 T 120 10 V 20 H 0 Z" />
            </svg>
            <svg
              aria-hidden="true"
              className="tube-wave tube-wave-back"
              viewBox="0 0 120 20"
              preserveAspectRatio="none"
            >
              <path d="M0 10 Q 15 18 30 10 T 60 10 T 90 10 T 120 10 V 20 H 0 Z" />
            </svg>
            <span className="tube-bubble" style={{ left: "28%", animationDelay: "0s" }} />
            <span className="tube-bubble" style={{ left: "62%", animationDelay: "1.4s" }} />
            <span className="tube-bubble" style={{ left: "45%", animationDelay: "2.6s" }} />
          </div>
          <div className="tube-shine" />
          <div className="tube-graduations" />
        </div>
      </div>
      <div className="mt-4 flex flex-col items-center gap-1.5 text-center">
        <SchoolGlyph slug={standing.slug} className="size-4" />
        <span className="whitespace-nowrap font-sans text-[0.68rem] text-paper/85 tracking-tight sm:font-mono sm:text-xs sm:uppercase sm:tracking-[0.08em]">
          {standing.name}
        </span>
        <span className="font-mono text-paper text-sm tabular-nums sm:text-lg">
          {format.number(share, { style: "percent", maximumFractionDigits: 1 })}
        </span>
      </div>
    </div>
  );
}

/**
 * The school race (docs/02 moment 2, docs/10 section 3): five test tubes
 * filling with light, ranked by share of each school's estimated headcount.
 * The tubes are decorative; the table below carries the same data for
 * everyone, screen readers included.
 */
export function SchoolRace({ initial }: { initial: WaitlistStats | null }) {
  const t = useTranslations("marketing.race");
  const format = useFormatter();
  const stats = useWaitlistStats(initial);
  const rackRef = useRef<HTMLDivElement>(null);
  const [filled, setFilled] = useState(false);

  // Liquids rise when the rack first comes into view.
  useEffect(() => {
    const rack = rackRef.current;
    if (!rack) {
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setFilled(true);
          observer.disconnect();
        }
      },
      { threshold: 0.25 },
    );
    observer.observe(rack);
    return () => observer.disconnect();
  }, []);

  const standings = stats?.schools ?? EMPTY;
  const maxShare = Math.max(0, ...standings.map((standing) => standing.share));
  const scale = tubeScale(maxShare);
  const leader = standings[0] && standings[0].count > 0 ? standings[0].slug : null;
  const slotOf = (slug: SchoolSlug) => standings.findIndex((standing) => standing.slug === slug);
  const total = stats?.total ?? 0;
  const goal = stats?.goal ?? 1000;
  const ticks = [1, 0.5, 0];

  return (
    <div className="mt-14 grid gap-12 lg:mt-20 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] lg:gap-16">
      <div
        ref={rackRef}
        aria-hidden="true"
        className="race-rack"
        data-field-rack
        data-filled={filled ? "true" : "false"}
      >
        <div className="race-scale">
          {ticks.map((tick) => (
            <span key={tick} style={{ bottom: `${tick * 100}%` }}>
              {format.number(scale * tick, { style: "percent", maximumFractionDigits: 1 })}
            </span>
          ))}
        </div>
        <div className="race-tubes">
          {SCHOOLS.map((school) => {
            const standing = standings.find((entry) => entry.slug === school.slug) ?? EMPTY[0];
            if (!standing) {
              return null;
            }
            return (
              <Tube
                key={school.slug}
                standing={standing}
                slot={slotOf(school.slug)}
                level={filled ? tubeLevel(standing.share, scale) : 0}
                leader={leader === school.slug}
              />
            );
          })}
        </div>
      </div>

      <div className="flex flex-col gap-8">
        <div className="flex items-center gap-3 font-mono text-volt text-xs uppercase tracking-[0.2em]">
          <span aria-hidden="true" className="relative flex size-2">
            <span className="absolute inset-0 animate-ping rounded-full bg-volt opacity-60" />
            <span className="relative size-2 rounded-full bg-volt" />
          </span>
          {t("live")}
        </div>

        <table className="race-table w-full text-left">
          <caption className="sr-only">{t("tableCaption")}</caption>
          <thead>
            <tr>
              <th scope="col">{t("rank")}</th>
              <th scope="col">{t("school")}</th>
              <th scope="col" className="text-right">
                {t("signups")}
              </th>
              <th scope="col" className="text-right">
                {t("share")}
              </th>
            </tr>
          </thead>
          <tbody>
            {standings.map((standing) => (
              <tr key={standing.slug} data-school={standing.slug}>
                <td className="tabular-nums">{stats ? standing.rank : "–"}</td>
                <th scope="row" className="font-normal">
                  <span className="flex items-center gap-2">
                    <SchoolGlyph slug={standing.slug} className="size-4 shrink-0" />
                    {standing.name}
                  </span>
                </th>
                <td className="text-right tabular-nums">{stats ? format.number(standing.count) : "–"}</td>
                <td className="text-right tabular-nums">
                  {stats
                    ? format.number(standing.share, { style: "percent", maximumFractionDigits: 1 })
                    : "–"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div>
          <div className="flex items-baseline justify-between gap-4">
            <p id="goal-label" className="font-mono text-paper/80 text-xs uppercase tracking-[0.18em]">
              {t("goalLabel")}
            </p>
            <p className="font-mono text-paper text-sm tabular-nums">
              {t("goalProgress", { total: format.number(total), goal: format.number(goal) })}
            </p>
          </div>
          <div
            role="progressbar"
            aria-labelledby="goal-label"
            aria-valuemin={0}
            aria-valuemax={goal}
            aria-valuenow={Math.min(total, goal)}
            aria-valuetext={t("goalProgress", { total: format.number(total), goal: format.number(goal) })}
            className="goal-bar mt-3"
          >
            <div
              className="goal-bar-fill"
              style={{ transform: `scaleX(${filled ? (stats?.goalRatio ?? 0) : 0})` }}
            />
          </div>
          <p className="mt-3 text-paper/80 text-sm">
            {total >= goal ? t("goalReached") : t("goalText", { goal: format.number(goal) })}
          </p>
        </div>

        <p className="text-paper/70 text-sm">{stats ? t("estimate") : t("unavailable")}</p>
      </div>
    </div>
  );
}
