import { MARK, orbitPoint, PAIR_FIELD_LINES, pairFieldPoint, pairGeometry } from "@atomes/three";
import { colors } from "@atomes/tokens";

/** Height of the stage in poster units; the width follows its aspect ratio. */
const HEIGHT = 100;
/** Points sampled along each field line. */
const FIELD_SAMPLES = 48;

const TAU = Math.PI * 2;
const round = (value: number) => Math.round(value * 10) / 10;

interface Atom {
  readonly x: number;
  readonly y: number;
  /** Tilt of the orbit, in SVG degrees (clockwise). */
  readonly rotate: number;
  readonly electron: { readonly x: number; readonly y: number };
  readonly nucleus: "plasma" | "volt";
  readonly charge: "plasma" | "volt";
}

interface Poster {
  readonly width: number;
  readonly radius: number;
  readonly atoms: readonly [Atom, Atom];
  readonly lines: ReadonlyArray<{ readonly line: number; readonly d: string }>;
}

const posters = new Map<number, Poster>();

/**
 * The very shapes the live field starts from (formations.ts): the two atoms,
 * apart, in a stage of `aspect`, in poster units (y down).
 */
function poster(aspect: number): Poster {
  const cached = posters.get(aspect);
  if (cached) {
    return cached;
  }
  const width = HEIGHT * aspect;
  const geometry = pairGeometry(
    {
      box: { x: width / 2, y: HEIGHT / 2, hw: width / 2, hh: HEIGHT / 2 },
      bond: 0,
      merge: 0,
      mark: { x: width / 2, y: HEIGHT / 2, radius: HEIGHT / 2 },
    },
    0,
  );
  const { a, b, radius, tiltB } = geometry;
  const point = { x: 0, y: 0 };
  const atom = (center: { x: number; y: number }, tilt: number, theta: number, left: boolean): Atom => {
    orbitPoint(center, radius, tilt, theta, point);
    return {
      x: round(center.x),
      y: round(HEIGHT - center.y),
      rotate: round((-tilt * 180) / Math.PI),
      electron: { x: round(point.x), y: round(HEIGHT - point.y) },
      nucleus: left ? "plasma" : "volt",
      charge: left ? "volt" : "plasma",
    };
  };
  const lines = Array.from({ length: PAIR_FIELD_LINES }, (_, line) => {
    const points: string[] = [];
    for (let sample = 0; sample <= FIELD_SAMPLES; sample += 1) {
      pairFieldPoint(geometry, line, sample / FIELD_SAMPLES, point);
      points.push(`${round(point.x)} ${round(HEIGHT - point.y)}`);
    }
    return { line, d: `M${points.join("L")}` };
  });
  const result: Poster = {
    width,
    radius,
    // Electrons where the live field starts them: the left one at angle 0, the right one opposite.
    atoms: [atom(a, MARK.tilt, 0, true), atom(b, tiltB, TAU / 2, false)],
    lines,
  };
  posters.set(aspect, result);
  return result;
}

const TONES = { plasma: colors.plasma, volt: colors.volt } as const;

/**
 * Static image of the hero's two atoms, for a stage of the given aspect ratio,
 * drawn from the same geometry as the live field so the WebGL canvas takes
 * over in place: dotted orbits, glowing nuclei and electrons, the field lines
 * between them. It is what visitors see with reduced motion, without WebGL,
 * or before the 3D chunk has loaded.
 */
export function IonFieldPoster({ aspect, className }: { aspect: number; className?: string }) {
  const { width, radius, atoms, lines } = poster(aspect);
  const id = `ion-${String(aspect).replace(".", "-")}`;
  // Dots along the strokes: round caps on zero-length dashes.
  const dot = (size: number, gap: number) => ({
    strokeWidth: size,
    strokeDasharray: `0 ${gap}`,
    strokeLinecap: "round" as const,
    fill: "none",
  });
  return (
    <svg
      aria-hidden="true"
      className={className}
      viewBox={`0 0 ${round(width)} ${HEIGHT}`}
      preserveAspectRatio="xMidYMid meet"
      // The field lines arch beyond the stage.
      overflow="visible"
    >
      <defs>
        {(Object.keys(TONES) as Array<keyof typeof TONES>).map((tone) => (
          <radialGradient key={tone} id={`${id}-${tone}`}>
            <stop offset="0" stopColor="#fff" stopOpacity="0.9" />
            <stop offset="0.3" stopColor={TONES[tone]} />
            <stop offset="0.55" stopColor={TONES[tone]} stopOpacity="0.4" />
            <stop offset="1" stopColor={TONES[tone]} stopOpacity="0" />
          </radialGradient>
        ))}
      </defs>
      <g stroke={colors.paper} opacity="0.6" {...dot(0.9, 3.4)}>
        {lines.map(({ line, d }) => (
          <path key={line} d={d} />
        ))}
      </g>
      {atoms.map((atom) => (
        <g key={atom.nucleus}>
          <ellipse
            cx={atom.x}
            cy={atom.y}
            rx={round(radius)}
            ry={round(radius * MARK.orbitMinor)}
            transform={`rotate(${atom.rotate} ${atom.x} ${atom.y})`}
            stroke={colors.paper}
            opacity="0.9"
            {...dot(1.3, 2.6)}
          />
          <circle cx={atom.x} cy={atom.y} r={round(radius * 0.36)} fill={`url(#${id}-${atom.nucleus})`} />
          <circle
            cx={atom.electron.x}
            cy={atom.electron.y}
            r={round(radius * 0.14)}
            fill={`url(#${id}-${atom.charge})`}
          />
        </g>
      ))}
    </svg>
  );
}
