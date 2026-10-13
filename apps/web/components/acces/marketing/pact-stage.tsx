"use client";

import { useTranslations } from "next-intl";
import { LogoMark } from "./logo";
import { digits, useRemaining } from "./pact-countdown";
import { usePactStyle } from "./pact-style";

/** The dial's sixty ticks (in a box of 200, its ring 96 from the middle), every fifth longer: as the atoms draw them. */
const TICKS = Array.from({ length: 60 }, (_, tick) => {
  const angle = (tick / 60) * 2 * Math.PI;
  const outer = 0.92 * 96;
  const inner = (0.92 - (tick % 5 === 0 ? 0.16 : 0.075)) * 96;
  const at = (radius: number) => ({ x: radius * Math.sin(angle), y: -radius * Math.cos(angle) });
  return { tick, hour: tick % 5 === 0, from: at(outer), to: at(inner) };
});
const round = (value: number) => Math.round(value * 100) / 100;

/** The dial: the countdown in its middle; its ticks, drawn by the atoms once the field is live. */
function Dial() {
  const t = useTranslations("marketing.pact");
  const remaining = useRemaining();
  return (
    <>
      <svg className="pact-ticks" viewBox="-100 -100 200 200" aria-hidden="true">
        <circle r="96" />
        {TICKS.map(({ tick, hour, from, to }) => (
          <line
            key={tick}
            data-hour={hour ? "" : undefined}
            x1={round(from.x)}
            y1={round(from.y)}
            x2={round(to.x)}
            y2={round(to.y)}
          />
        ))}
      </svg>
      {remaining === null ? null : (
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
      )}
    </>
  );
}

/**
 * The couple as the atoms draw it (formations.ts), in a box of 100: two atoms
 * as the logo's, on a diagonal, the first up on the left, a bond between
 * their nuclei; each orbit 19.2 across, tilted as the logo's.
 */
const ATOMS = [
  { x: 27.92, y: 39.44, nucleus: "fill-plasma", electron: -2.2 },
  { x: 72.08, y: 60.56, nucleus: "fill-volt", electron: 0.9 },
] as const;
const ORBIT = 19.2;
const NUCLEUS = (ORBIT * 6) / 22;
const TILT = -Math.PI / 6;
const onOrbit = (atom: (typeof ATOMS)[number], theta: number) => {
  const ex = ORBIT * Math.cos(theta);
  const ey = ((ORBIT * 9) / 22) * Math.sin(theta);
  return {
    x: round(atom.x + ex * Math.cos(TILT) - ey * Math.sin(TILT)),
    y: round(atom.y + ex * Math.sin(TILT) + ey * Math.cos(TILT)),
  };
};

/** The couple: two atoms and their bond, drawn by the atoms once the field is live. */
function Couple() {
  const t = useTranslations("marketing.pact");
  const [first, second] = ATOMS;
  return (
    <>
      <svg className="pact-couple" viewBox="0 0 100 100" aria-hidden="true">
        <line x1={first.x} y1={first.y} x2={second.x} y2={second.y} />
        {ATOMS.map((atom) => {
          const electron = onOrbit(atom, atom.electron);
          return (
            <g key={atom.nucleus}>
              <ellipse
                cx={atom.x}
                cy={atom.y}
                rx={ORBIT}
                ry={round((ORBIT * 9) / 22)}
                transform={`rotate(-30 ${atom.x} ${atom.y})`}
              />
              <circle cx={atom.x} cy={atom.y} r={round(NUCLEUS)} className={atom.nucleus} />
              <circle cx={electron.x} cy={electron.y} r="1.6" className="fill-volt" />
            </g>
          );
        })}
      </svg>
      <p className="pact-caption">{t("bond")} · 11.02.2027 · 20:00</p>
    </>
  );
}

/** The sealed vial in its rings: its liquid, drawn by the atoms once the field is live. */
function Vial() {
  const t = useTranslations("marketing.pact");
  return (
    <>
      <div className="pact-ring pact-ring-1" />
      <div className="pact-ring pact-ring-2" />
      <div className="pact-ring pact-ring-3" />
      <div className="pact-vial">
        <div className="pact-vial-glass">
          <div className="pact-vial-liquid" />
        </div>
        <div className="pact-vial-cap">
          <LogoMark className="pact-vial-mark" />
        </div>
      </div>
      <p className="pact-caption">{t("sample")} · 11.02.2027 · 20:00</p>
    </>
  );
}

/**
 * The Pact's stage, beside its countdown (pact-section.tsx), in one of three
 * versions to compare (`?pacte=cadran`, `couple` or `fiole`): the field reads
 * which from `data-pact` (ion-field-canvas.tsx) and draws it with its atoms.
 */
export function PactStage() {
  const style = usePactStyle();
  return (
    <div
      aria-hidden="true"
      data-field-pact
      data-pact={style}
      className={`pact-stage pact-stage-${style} relative mx-auto aspect-square w-full max-w-[30rem]`}
    >
      {style === "couple" ? <Couple /> : style === "vial" ? <Vial /> : <Dial />}
    </div>
  );
}
