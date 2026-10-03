"use client";

import { countdown } from "@epilove/core";
import { useTranslations } from "next-intl";

/**
 * The shared countdown (PAC-03), in the "lab" mono font. Remaining time is
 * computed on the server's clock by the caller; the accessible label is
 * coarse (it would be noisy every second).
 */
export function Countdown({ remainingMs, label }: { remainingMs: number; label: string }) {
  const t = useTranslations("pact.countdown");
  const parts = countdown(remainingMs);
  const units = [
    { value: parts.days, unit: t("days"), show: parts.days > 0 },
    { value: parts.hours, unit: t("hours"), show: true },
    { value: parts.minutes, unit: t("minutes"), show: true },
    { value: parts.seconds, unit: t("seconds"), show: true },
  ].filter((u) => u.show);
  return (
    <div className="flex flex-col items-center gap-3">
      <p className="font-mono text-paper/70 text-xs uppercase tracking-widest">{label}</p>
      <p
        className="flex items-baseline gap-3 font-mono text-5xl tabular-nums sm:text-7xl"
        role="timer"
        aria-label={t("label", {
          days: parts.days,
          hours: parts.hours,
          minutes: parts.minutes,
          seconds: parts.seconds,
        })}
      >
        {units.map((u) => (
          <span key={u.unit} className="flex items-baseline gap-1" aria-hidden="true">
            <span suppressHydrationWarning>{String(u.value).padStart(2, "0")}</span>
            <span className="text-base text-paper/60 sm:text-xl">{u.unit}</span>
          </span>
        ))}
      </p>
    </div>
  );
}
