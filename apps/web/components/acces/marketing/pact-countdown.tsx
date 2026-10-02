"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { PACT_REVEAL_AT, type Remaining, remainingUntil } from "./pact";

const UNITS = ["days", "hours", "minutes", "seconds"] as const;

/**
 * Countdown to the Pact reveal. The digits tick on the client only (no
 * hydration mismatch) and are hidden from screen readers, which get the date
 * itself instead of a value changing every second.
 */
export function PactCountdown() {
  const t = useTranslations("marketing.pact");
  const [remaining, setRemaining] = useState<Remaining | null | undefined>(undefined);

  useEffect(() => {
    const target = Date.parse(PACT_REVEAL_AT);
    const tick = () => setRemaining(remainingUntil(target, Date.now()));
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <div>
      <p className="font-mono text-paper/80 text-xs uppercase tracking-[0.2em]">{t("countdownLabel")}</p>
      <p className="mt-2 font-display text-2xl text-paper sm:text-3xl">
        <time dateTime={PACT_REVEAL_AT}>{t("date")}</time>
      </p>
      {remaining === null ? (
        <p className="mt-6 font-display text-3xl text-volt">{t("revealed")}</p>
      ) : (
        <div aria-hidden="true" className="mt-6 grid grid-cols-4 gap-2 sm:gap-3">
          {UNITS.map((unit) => (
            <div key={unit} className="countdown-cell">
              <span className="font-mono text-[clamp(2rem,7vw,4.5rem)] text-paper tabular-nums leading-none">
                {remaining === undefined ? "--" : String(remaining[unit]).padStart(2, "0")}
              </span>
              <span className="mt-2 font-mono text-[0.6rem] text-paper/70 uppercase tracking-[0.16em] sm:text-xs">
                {t(unit)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
