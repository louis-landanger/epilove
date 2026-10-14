import type { FormationParticles, PactFormation } from "./formations";

/**
 * The Pact's dial as the atoms draw it round the countdown (formations.ts,
 * PactFormation): sixty ticks, every fifth longer, inside a thin ring of
 * dots, its hand a couple of atoms riding the ring. Loaded on its own, as
 * the Pact's stage comes near (loadPactDial): most visits never get that far.
 */

/** What the dial sets of a particle's contribution (formations.ts). */
interface Look {
  x: number;
  y: number;
  glow: number;
  volt: number;
  plasma: number;
  paper: number;
  grain: number;
}

const TAU = Math.PI * 2;
const fract = (value: number) => value - Math.floor(value);

/**
 * The dial, in radii of the stage. Shares of the particles: DIAL_COUPLE the
 * hand, up to DIAL_RING the ring, the rest the ticks, as many on each as it
 * is long.
 */
const DIAL_TICKS = 60;
const DIAL_EDGE = 0.92;
const DIAL_TICK = 0.075;
const DIAL_HOUR = 0.16;
const DIAL_WIDTH = 0.008;
const DIAL_COUPLE = 0.07;
const DIAL_RING = 0.3;
/** Light of the ring, of the ticks and of every fifth; and of the hand's, as it goes by. */
const DIAL_RING_GLOW = 0.25;
const DIAL_TICK_GLOW = 0.42;
const DIAL_HOUR_GLOW = 0.62;
export const DIAL_HAND_GLOW = 1.5;
/** How long the hand's light lingers behind it, in seconds: on the ticks, and on the ring. */
const DIAL_TRAIL = 2.4;
const DIAL_RING_TRAIL = 7;
/**
 * The hand: two atoms riding the ring, bonded, the plasma one ahead and the
 * volt one behind (the logo's colours), their nuclei DIAL_NUCLEUS across,
 * DIAL_APART apart along the ring; NUCLEI of the hand's particles in them,
 * the others on the bond.
 */
const DIAL_NUCLEUS = 0.034;
const DIAL_APART = 0.085;
const NUCLEI = 0.86;
export const DIAL_COUPLE_GLOW = 1.4;
const DIAL_GRAIN = 0.65;
const DIAL_DOT = 0.006;

/** A finer grain for a particle, its light no bigger than `dot`: even dots, and no bond (scene.ts). */
function fineGrain(particles: FormationParticles, index: number, grain: number, dot: number): number {
  return grain * Math.min(1, dot / (particles.sizes[index] || dot));
}

/**
 * The particle `index` in the Pact's dial, round the countdown: its hand
 * goes round with the countdown's seconds, a couple of atoms riding the
 * ring, lighting each tick in plasma as it goes by and leaving a comet on
 * the ring behind it.
 */
export function pactDialContribution(
  particles: FormationParticles,
  index: number,
  pact: PactFormation,
  time: number,
  into: Look,
): void {
  const along = particles.along[index] ?? 0;
  const lanes = particles.lanes[index] ?? 0;
  const phase = particles.phases[index] ?? 0;
  // Ticks gone by since the top of the minute, clockwise, as the countdown's seconds run down.
  const hand = DIAL_TICKS - (pact.seconds ?? 0);
  into.grain = fineGrain(particles, index, DIAL_GRAIN, DIAL_DOT);
  if (lanes < DIAL_COUPLE) {
    // The hand: the plasma atom ahead, the volt one behind it along the ring, the bond between.
    const u = lanes / DIAL_COUPLE;
    const ahead = Math.PI / 2 - (hand / DIAL_TICKS) * TAU;
    if (u < NUCLEI) {
      const behind = u >= NUCLEI / 2;
      const at = ahead + (behind ? DIAL_APART : 0);
      const r = Math.sqrt(fract(u / (NUCLEI / 2))) * (DIAL_NUCLEUS / 2);
      // Its formation coordinates, not its index: the same place whatever the field (formations.ts, shapeHost).
      const theta = phase * TAU + time * 0.8;
      into.x = pact.x + (Math.cos(at) + Math.cos(theta) * r) * pact.radius;
      into.y = pact.y + (Math.sin(at) + Math.sin(theta) * r) * pact.radius;
      into.glow = DIAL_COUPLE_GLOW;
      into.plasma = behind ? 0 : 1;
      into.volt = behind ? 1 : 0;
      into.paper = 0;
      return;
    }
    const at = ahead + ((u - NUCLEI) / (1 - NUCLEI)) * DIAL_APART;
    into.x = pact.x + Math.cos(at) * pact.radius;
    into.y = pact.y + Math.sin(at) * pact.radius;
    into.glow = 0.8;
    into.paper = 0.85;
    return;
  }
  let position = along * DIAL_TICKS;
  let reach = 1 + 0.004 * Math.sin(time * 1.4 + phase * TAU);
  let across = 0;
  let glow = DIAL_RING_GLOW;
  let trail = DIAL_RING_TRAIL;
  if (lanes >= DIAL_RING) {
    // Every fifth tick longer: each takes particles as it is long.
    const group = DIAL_HOUR + 4 * DIAL_TICK;
    const hour = Math.floor(along * 12);
    const left = (along * 12 - hour) * group;
    const minor = left < DIAL_HOUR ? -1 : Math.min(3, Math.floor((left - DIAL_HOUR) / DIAL_TICK));
    const length = minor < 0 ? DIAL_HOUR : DIAL_TICK;
    position = hour * 5 + minor + 1;
    reach = DIAL_EDGE - length * ((lanes - DIAL_RING) / (1 - DIAL_RING));
    across = (phase * 2 - 1) * DIAL_WIDTH;
    glow = minor < 0 ? DIAL_HOUR_GLOW : DIAL_TICK_GLOW;
    trail = DIAL_TRAIL;
  }
  const angle = Math.PI / 2 - (position / DIAL_TICKS) * TAU;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  into.x = pact.x + (cos * reach - sin * across) * pact.radius;
  into.y = pact.y + (sin * reach + cos * across) * pact.radius;
  const lit = Math.exp(-(fract((hand - position) / DIAL_TICKS) * DIAL_TICKS) / trail);
  into.glow = glow + DIAL_HAND_GLOW * lit;
  into.plasma = lit;
  into.volt = 0;
  into.paper = 0.85 * (1 - lit);
}
