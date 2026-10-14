import { PactDialTime } from "./pact-countdown";

/** The dial's sixty ticks (in a box of 200, its ring 96 from the middle), every fifth longer: as the atoms draw them. */
const TICKS = Array.from({ length: 60 }, (_, tick) => {
  const angle = (tick / 60) * 2 * Math.PI;
  const outer = 0.92 * 96;
  const inner = (0.92 - (tick % 5 === 0 ? 0.16 : 0.075)) * 96;
  const at = (radius: number) => ({ x: radius * Math.sin(angle), y: -radius * Math.cos(angle) });
  return { tick, hour: tick % 5 === 0, from: at(outer), to: at(inner) };
});
const round = (value: number) => Math.round(value * 100) / 100;

/**
 * The Pact's stage, beside its title (pact-section.tsx): a watch's dial, the
 * countdown in its middle. Once the field is live, its atoms draw the dial
 * (formations.ts, pact-dial.ts), its hand a couple of atoms going round with
 * the countdown's seconds; without it, CSS draws the ticks.
 */
export function PactStage() {
  return (
    <div
      aria-hidden="true"
      data-field-pact
      className="pact-stage relative mx-auto aspect-square w-full max-w-[30rem]"
    >
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
      <PactDialTime />
    </div>
  );
}
