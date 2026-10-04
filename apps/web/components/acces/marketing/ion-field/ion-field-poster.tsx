import { createIonFieldLayout, SCHOOL_KEYS } from "@atomes/three";
import { schoolColors } from "@atomes/tokens";

const POSTER_PARTICLES = 260;
const layout = createIonFieldLayout(POSTER_PARTICLES);

const percent = (value: number) => `${(value * 100).toFixed(2)}%`;
const toX = (x: number) => percent((x + 1) / 2);
const toY = (y: number) => percent((1 - y) / 2);

/**
 * Static image of the ion field: the first particles of the very layout the
 * live scene starts from, so the WebGL canvas fades in on top seamlessly. It
 * is what visitors see with reduced motion, without WebGL, or before the 3D
 * chunk has loaded. Positions are percentages so circles stay round at any
 * aspect ratio, as in the live scene.
 */
export function IonFieldPoster({ className }: { className?: string }) {
  const bonds: Array<{ key: number; x1: string; y1: string; x2: string; y2: string; color: string }> = [];
  for (let index = 0; index < layout.count; index += 2) {
    const ax = layout.positions[index * 2] ?? 0;
    const ay = layout.positions[index * 2 + 1] ?? 0;
    const bx = layout.positions[index * 2 + 2] ?? 0;
    const by = layout.positions[index * 2 + 3] ?? 0;
    if (Math.hypot(ax - bx, ay - by) < 0.1) {
      const school = SCHOOL_KEYS[layout.schools[index] ?? 0] ?? "epita";
      bonds.push({
        key: index,
        x1: toX(ax),
        y1: toY(ay),
        x2: toX(bx),
        y2: toY(by),
        color: schoolColors[school],
      });
    }
  }

  return (
    <svg aria-hidden="true" className={className} width="100%" height="100%">
      <defs>
        {SCHOOL_KEYS.map((key) => (
          <radialGradient key={key} id={`ion-${key}`}>
            <stop offset="0" stopColor="#fff" />
            <stop offset="0.16" stopColor={schoolColors[key]} />
            <stop offset="0.42" stopColor={schoolColors[key]} stopOpacity="0.35" />
            <stop offset="1" stopColor={schoolColors[key]} stopOpacity="0" />
          </radialGradient>
        ))}
      </defs>
      <g strokeWidth="1" strokeLinecap="round" opacity="0.55">
        {bonds.map((bond) => (
          <line key={bond.key} x1={bond.x1} y1={bond.y1} x2={bond.x2} y2={bond.y2} stroke={bond.color} />
        ))}
      </g>
      <g>
        {Array.from({ length: layout.count }, (_, index) => {
          const school = SCHOOL_KEYS[layout.schools[index] ?? 0] ?? "epita";
          const size = layout.sizes[index] ?? 0.005;
          const radius = size * 450 * 3.2;
          // Same depth cue as the live field: small ions are dimmer.
          const depth = 0.26 + 0.74 * Math.min(1, Math.max(0, (size - 0.003) / 0.011));
          return (
            <circle
              // biome-ignore lint/suspicious/noArrayIndexKey: particles are a fixed, ordered set.
              key={index}
              cx={toX(layout.positions[index * 2] ?? 0)}
              cy={toY(layout.positions[index * 2 + 1] ?? 0)}
              r={radius.toFixed(2)}
              fill={`url(#ion-${school})`}
              opacity={depth.toFixed(2)}
            />
          );
        })}
      </g>
    </svg>
  );
}
