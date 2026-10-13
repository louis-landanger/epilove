"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { PACT_REVEAL_AT, type Remaining, remainingUntil } from "./pact";
import { usePactStyle } from "./pact-style";

const UNITS = ["days", "hours", "minutes", "seconds"] as const;

/**
 * Time left until the Pact reveal, ticking every second on the client only
 * (no hydration mismatch): undefined until mounted, null once it has passed.
 */
export function useRemaining(): Remaining | null | undefined {
  "use no memo";
  const [remaining, setRemaining] = useState<Remaining | null | undefined>(undefined);
  useEffect(() => {
    const target = Date.parse(PACT_REVEAL_AT);
    const tick = () => setRemaining(remainingUntil(target, Date.now()));
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, []);
  return remaining;
}

/** Two digits, or dashes until the countdown is mounted. */
export const digits = (value: number | undefined) =>
  value === undefined ? "--" : String(value).padStart(2, "0");

/**
 * Countdown to the Pact reveal, beside its stage: the date, then the time
 * left in a line (the dial shows it in its middle instead). The digits are
 * hidden from screen readers, which get the date itself instead of a value
 * changing every second.
 */
export function PactCountdown() {
  // Nothing to memoise: it renders once a second, or once.
  "use no memo";
  const t = useTranslations("marketing.pact");
  const style = usePactStyle();
  const remaining = useRemaining();

  return (
    <div>
      <p className="font-mono text-paper/80 text-xs uppercase tracking-[0.2em]">
        {style === "dial" ? t("revealLabel") : t("countdownLabel")}
      </p>
      <p className="mt-2 font-display text-2xl text-paper sm:text-3xl">
        <time dateTime={PACT_REVEAL_AT}>{t("date")}</time>
      </p>
      {remaining === null ? (
        <p className="mt-6 font-display text-3xl text-volt">{t("revealed")}</p>
      ) : style === "dial" ? null : (
        <div aria-hidden="true" className="pact-countdown mt-8">
          {UNITS.map((unit) => (
            <div key={unit} className="pact-countdown-unit">
              <span className="pact-countdown-value">{digits(remaining?.[unit])}</span>
              <span className="pact-countdown-label">{t(unit)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** The countdown in the middle of the Pact's dial (pact-stage.tsx): the days, large, then the rest. */
export function PactDialTime() {
  "use no memo";
  const t = useTranslations("marketing.pact");
  const remaining = useRemaining();
  if (remaining === null) {
    return null;
  }
  return (
    <div className="pact-dial-time">
      <span className="pact-dial-days">{remaining === undefined ? "--" : remaining.days}</span>
      <span className="pact-dial-unit">{t("days")}</span>
      <span className="pact-dial-clock">
        {digits(remaining?.hours)}
        <span className="pact-dial-colon">:</span>
        {digits(remaining?.minutes)}
        <span className="pact-dial-colon">:</span>
        <span className="pact-dial-seconds">{digits(remaining?.seconds)}</span>
      </span>
      <span className="pact-dial-unit">{t("untilReveal")}</span>
    </div>
  );
}
