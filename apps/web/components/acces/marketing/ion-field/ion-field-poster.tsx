import { createIonFieldLayout, FORMATION_STRIDE, writeFormations } from "@atomes/three";
import { colors } from "@atomes/tokens";

const POSTER_PARTICLES = 420;
/** The stage in poster units: the same proportions the live pair is drawn for (2.4:1). */
const WIDTH = 240;
const HEIGHT = 100;

const layout = createIonFieldLayout(POSTER_PARTICLES);
const targets = new Float32Array(layout.count * FORMATION_STRIDE);
const looks = new Float32Array(layout.count * FORMATION_STRIDE);
// The very shapes the live field starts from (formations.ts): the two atoms, apart.
writeFormations(
  targets,
  looks,
  layout,
  {
    pair: {
      weight: 1,
      box: { x: WIDTH / 2, y: HEIGHT / 2, hw: WIDTH / 2, hh: HEIGHT / 2 },
      bond: 0,
      merge: 0,
      mark: { x: WIDTH / 2, y: HEIGHT / 2, radius: HEIGHT / 2 },
    },
  },
  null,
  0,
  1,
);

const TONES = { paper: colors.paper, plasma: colors.plasma, volt: colors.volt } as const;
type Tone = keyof typeof TONES;

const particles = Array.from({ length: layout.count }, (_, index) => {
  const offset = index * FORMATION_STRIDE;
  const volt = looks[offset] ?? 0;
  const plasma = looks[offset + 1] ?? 0;
  const glow = looks[offset + 2] ?? 1;
  // Nuclei and electrons take the brand accents; orbits and field lines are paper white.
  const tone: Tone = plasma >= 0.5 ? "plasma" : volt >= 0.5 ? "volt" : "paper";
  const size = layout.sizes[index] ?? 0.005;
  return {
    x: (targets[offset] ?? 0).toFixed(2),
    // World units point up, SVG units down.
    y: (HEIGHT - (targets[offset + 1] ?? 0)).toFixed(2),
    r: (size * 220).toFixed(2),
    tone,
    opacity: Math.min(1, 0.35 + glow * 0.6).toFixed(2),
  };
});

/**
 * Static image of the hero's two atoms: the first particles of the very
 * formation the live scene starts from, so the WebGL canvas takes over
 * seamlessly. It is what visitors see with reduced motion, without WebGL, or
 * before the 3D chunk has loaded.
 */
export function IonFieldPoster({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      preserveAspectRatio="xMidYMid meet"
    >
      <defs>
        {(Object.keys(TONES) as Tone[]).map((tone) => (
          <radialGradient key={tone} id={`ion-${tone}`}>
            <stop offset="0" stopColor="#fff" />
            <stop offset="0.2" stopColor={TONES[tone]} />
            <stop offset="0.5" stopColor={TONES[tone]} stopOpacity="0.3" />
            <stop offset="1" stopColor={TONES[tone]} stopOpacity="0" />
          </radialGradient>
        ))}
      </defs>
      {particles.map((particle, index) => (
        <circle
          // biome-ignore lint/suspicious/noArrayIndexKey: particles are a fixed, ordered set.
          key={index}
          cx={particle.x}
          cy={particle.y}
          r={particle.r}
          fill={`url(#ion-${particle.tone})`}
          opacity={particle.opacity}
        />
      ))}
    </svg>
  );
}
