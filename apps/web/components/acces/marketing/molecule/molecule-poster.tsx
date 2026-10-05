import {
  type LinearRgb,
  linearSrgbToHex,
  MOLECULE,
  type MoleculeTone,
  moleculePose,
  project,
  type RingPose,
  ringPoint,
  tokenToLinearSrgb,
  type Vec3,
} from "@atomes/three";
import { colors } from "@atomes/tokens";

/**
 * The hero's molecule, still: the pose at time 0 (packages/three, pose.ts)
 * drawn in SVG, exactly where the live scene starts, so the live scene takes
 * over from this poster without a jump. Rendered on the server; it stays
 * for good with reduced motion, on modest devices and without WebGL2.
 */

const TAU = Math.PI * 2;
const WHITE: LinearRgb = [1, 1, 1];
const TONES: Record<MoleculeTone, LinearRgb> = {
  plasma: tokenToLinearSrgb(colors.plasma),
  volt: tokenToLinearSrgb(colors.volt),
};
const PAPER = linearSrgbToHex(tokenToLinearSrgb(colors.paper));

const mixRgb = (a: LinearRgb, b: LinearRgb, t: number): LinearRgb => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];
const hex = (rgb: LinearRgb) => linearSrgbToHex(rgb);
const f = (value: number) => value.toFixed(4);
const smoothstep = (edge0: number, edge1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
};

/** Projected, with y down as SVG wants it. */
function at(point: Vec3) {
  const p = project(point);
  return { x: p.x, y: -p.y, scale: p.scale };
}

/**
 * A ring as short runs of its outline, each as bright as its depth: the far
 * half of the orbit is dimmer, and drawn under the nucleus.
 */
function ringRuns(ring: RingPose) {
  const steps = 96;
  const perRun = 8;
  const points = Array.from({ length: steps + 1 }, (_, index) => ringPoint(ring, (index / steps) * TAU));
  const runs: Array<{
    readonly id: number;
    readonly d: string;
    readonly near: number;
    readonly scale: number;
  }> = [];
  for (let start = 0; start < steps; start += perRun) {
    const slice = points.slice(start, start + perRun + 1);
    const depth = slice.reduce((sum, point) => sum + point.z, 0) / slice.length;
    const middle = slice[Math.floor(slice.length / 2)] ?? ring.center;
    runs.push({
      id: start,
      d: slice
        .map((point, index) => {
          const p = at(point);
          return `${index === 0 ? "M" : "L"}${f(p.x)} ${f(p.y)}`;
        })
        .join(""),
      near: smoothstep(-1, 1, (depth - ring.center.z) / ring.radius),
      scale: at(middle).scale,
    });
  }
  return runs;
}

/** The electron's trail: short dashes behind it, brighter and wider towards the head. */
function trailRuns(ring: RingPose) {
  const steps = 10;
  return Array.from({ length: steps }, (_, index) => {
    const from = at(ringPoint(ring, ring.electron - MOLECULE.trail * (1 - index / steps)));
    const to = at(ringPoint(ring, ring.electron - MOLECULE.trail * (1 - (index + 1) / steps)));
    const t = (index + 1) / steps;
    return {
      id: index,
      d: `M${f(from.x)} ${f(from.y)}L${f(to.x)} ${f(to.y)}`,
      opacity: 0.85 * t ** 1.6,
      width: (0.006 + 0.016 * t) * to.scale,
    };
  });
}

function Glows({ tone }: { tone: MoleculeTone }) {
  const rgb = TONES[tone];
  return (
    <>
      <radialGradient id={`mol-nucleus-${tone}`}>
        <stop offset="0" stopColor={hex(mixRgb(rgb, WHITE, 0.85))} />
        <stop offset="0.5" stopColor={hex(rgb)} />
        <stop offset="1" stopColor={hex(rgb)} stopOpacity="0.15" />
      </radialGradient>
      <radialGradient id={`mol-halo-${tone}`}>
        <stop offset="0" stopColor={hex(rgb)} stopOpacity="0.6" />
        <stop offset="1" stopColor={hex(rgb)} stopOpacity="0" />
      </radialGradient>
      <radialGradient id={`mol-electron-${tone}`}>
        <stop offset="0" stopColor={hex(mixRgb(rgb, WHITE, 0.75))} />
        <stop offset="0.4" stopColor={hex(rgb)} stopOpacity="0.9" />
        <stop offset="1" stopColor={hex(rgb)} stopOpacity="0" />
      </radialGradient>
    </>
  );
}

export function MoleculePoster({ className }: { className?: string }) {
  const pose = moleculePose(0);
  const from = at(pose.bond.from);
  const to = at(pose.bond.to);
  const bondScale = (from.scale + to.scale) / 2;
  const sparks = pose.sparks.map((spark, index) => ({ id: index, ...spark }));
  const atoms = pose.atoms.map((atom) => {
    const center = at(atom.center);
    const electronTone: MoleculeTone = atom.tone === "plasma" ? "volt" : "plasma";
    return {
      tone: atom.tone,
      electronTone,
      center,
      nucleus: atom.nucleus * center.scale,
      rings: atom.rings.map((ring, index) => ({
        id: `${atom.tone}-${index}`,
        runs: ringRuns(ring),
        trail: trailRuns(ring),
        electron: at(ringPoint(ring, ring.electron)),
      })),
    };
  });

  return (
    <svg
      viewBox="-1 -1 2 2"
      preserveAspectRatio="xMidYMid meet"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      <title>Deux atomes aux orbites entrelacées</title>
      <defs>
        <Glows tone="plasma" />
        <Glows tone="volt" />
        <linearGradient
          id="mol-bond"
          gradientUnits="userSpaceOnUse"
          x1={f(from.x)}
          y1={f(from.y)}
          x2={f(to.x)}
          y2={f(to.y)}
        >
          <stop offset="0" stopColor={hex(TONES.plasma)} />
          <stop offset="1" stopColor={hex(TONES.volt)} />
        </linearGradient>
      </defs>
      <g className="molecule-glow">
        <line
          x1={f(from.x)}
          y1={f(from.y)}
          x2={f(to.x)}
          y2={f(to.y)}
          stroke="url(#mol-bond)"
          strokeWidth={f(0.16 * bondScale)}
          strokeLinecap="round"
          opacity="0.22"
        />
        <line
          x1={f(from.x)}
          y1={f(from.y)}
          x2={f(to.x)}
          y2={f(to.y)}
          stroke="url(#mol-bond)"
          strokeWidth={f(0.03 * bondScale)}
          strokeLinecap="round"
          opacity="0.6"
        />
        {atoms.map((atom) => (
          <circle
            key={atom.tone}
            cx={f(atom.center.x)}
            cy={f(atom.center.y)}
            r={f(atom.nucleus * 5.5)}
            fill={`url(#mol-halo-${atom.tone})`}
            opacity="0.45"
          />
        ))}
      </g>
      {atoms.map((atom) => (
        <g key={atom.tone}>
          {atom.rings.map((ring) =>
            ring.runs.map((run) =>
              run.near < 0.5 ? (
                <RingRun key={`${ring.id}-${run.id}`} d={run.d} near={run.near} scale={run.scale} />
              ) : null,
            ),
          )}
          <circle
            cx={f(atom.center.x)}
            cy={f(atom.center.y)}
            r={f(atom.nucleus * 2.2)}
            fill={`url(#mol-halo-${atom.tone})`}
            className="molecule-glow"
          />
          <circle
            cx={f(atom.center.x)}
            cy={f(atom.center.y)}
            r={f(atom.nucleus)}
            fill={`url(#mol-nucleus-${atom.tone})`}
          />
          {atom.rings.map((ring) =>
            ring.runs.map((run) =>
              run.near >= 0.5 ? (
                <RingRun key={`${ring.id}-${run.id}`} d={run.d} near={run.near} scale={run.scale} />
              ) : null,
            ),
          )}
          {atom.rings.map((ring) => (
            <g key={ring.id} className="molecule-glow">
              {ring.trail.map((run) => (
                <path
                  key={run.id}
                  d={run.d}
                  fill="none"
                  stroke={hex(TONES[atom.electronTone])}
                  strokeWidth={f(run.width)}
                  strokeLinecap="round"
                  opacity={f(run.opacity)}
                />
              ))}
              <circle
                cx={f(ring.electron.x)}
                cy={f(ring.electron.y)}
                r={f(0.14 * ring.electron.scale)}
                fill={`url(#mol-halo-${atom.electronTone})`}
                opacity="0.8"
              />
              <circle
                cx={f(ring.electron.x)}
                cy={f(ring.electron.y)}
                r={f(0.032 * ring.electron.scale)}
                fill={`url(#mol-electron-${atom.electronTone})`}
              />
            </g>
          ))}
        </g>
      ))}
      <g className="molecule-glow">
        {sparks.map((spark) => {
          const p = at(spark.position);
          const color = hex(mixRgb(TONES.plasma, TONES.volt, spark.along));
          return (
            <g key={spark.id}>
              <circle
                cx={f(p.x)}
                cy={f(p.y)}
                r={f(0.09 * p.scale)}
                fill={color}
                opacity={f(0.3 * spark.light)}
              />
              <circle
                cx={f(p.x)}
                cy={f(p.y)}
                r={f(0.04 * p.scale)}
                fill={color}
                opacity={f(0.9 * spark.light)}
              />
            </g>
          );
        })}
      </g>
    </svg>
  );
}

function RingRun({ d, near, scale }: { d: string; near: number; scale: number }) {
  const light = 0.3 + 0.7 * near;
  return (
    <>
      <path
        d={d}
        fill="none"
        stroke={PAPER}
        strokeWidth={f(0.06 * scale)}
        strokeLinecap="round"
        opacity={f(0.14 * light)}
        className="molecule-glow"
      />
      <path
        d={d}
        fill="none"
        stroke={PAPER}
        strokeWidth={f(0.013 * scale)}
        strokeLinecap="round"
        opacity={f(light)}
      />
    </>
  );
}
