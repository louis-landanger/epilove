"use client";

import type { OwnProfile } from "@epilove/contracts";
import { CircleCheck, Sparkle } from "lucide-react";
import { useTranslations } from "next-intl";

const RADIUS = 34;
/** Tips whose feature is not available yet (ONB-08, PRO-07): not shown. */
const UPCOMING = new Set(["verify_photo", "add_anthem"]);
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/** Completeness ring and the tips that would raise it most (PRO-05). */
export function CompletenessGauge({ completeness }: { completeness: OwnProfile["completeness"] }) {
  const t = useTranslations("profile");
  const { score } = completeness;
  const tips = completeness.tips.filter((tip) => !UPCOMING.has(tip));
  return (
    <section
      aria-labelledby="completeness-title"
      className="flex flex-col gap-5 rounded-[2rem] border border-paper/10 bg-paper/[0.03] p-5 sm:flex-row sm:items-center sm:gap-6"
    >
      <div
        className="relative grid size-24 shrink-0 place-items-center"
        role="img"
        aria-label={t("completeness.label", { score })}
      >
        <svg viewBox="0 0 80 80" className="-rotate-90 absolute inset-0 size-full" aria-hidden="true">
          <defs>
            <linearGradient id="completeness-stroke" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="var(--color-plasma)" />
              <stop offset="100%" stopColor="var(--color-volt)" />
            </linearGradient>
          </defs>
          <circle
            cx="40"
            cy="40"
            r={RADIUS}
            fill="none"
            stroke="currentColor"
            strokeOpacity="0.1"
            strokeWidth="7"
          />
          <circle
            cx="40"
            cy="40"
            r={RADIUS}
            fill="none"
            stroke="url(#completeness-stroke)"
            strokeWidth="7"
            strokeLinecap="round"
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={CIRCUMFERENCE * (1 - score / 100)}
            className="transition-[stroke-dashoffset] duration-700 ease-out"
          />
        </svg>
        <span className="font-display font-semibold text-2xl tabular-nums" aria-hidden="true">
          {score}
          <span className="text-paper/50 text-sm">%</span>
        </span>
      </div>
      <div className="flex flex-col gap-2">
        <h2 id="completeness-title" className="font-semibold text-lg">
          {tips.length === 0 ? t("completeness.done") : t("completeness.next")}
        </h2>
        {tips.length === 0 ? (
          <p className="flex items-center gap-2 text-paper/70 text-sm">
            <CircleCheck className="size-4 text-success" aria-hidden="true" />
            {t("completeness.label", { score })}
          </p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {tips.slice(0, 3).map((tip) => (
              <li key={tip} className="flex items-start gap-2 text-paper/75 text-sm">
                <Sparkle className="mt-0.5 size-3.5 shrink-0 text-volt" aria-hidden="true" />
                {t(`tips.${tip}`)}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
