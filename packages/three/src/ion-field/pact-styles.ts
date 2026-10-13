import type { FormationParticles, PactFormation } from "./formations";
import { orbitArcPoint } from "./formations";
import { MARK } from "./layout";

/**
 * The Pact's stage as the atoms draw it, in three styles to compare
 * (formations.ts, PactFormation): a dial round the countdown, a couple of
 * atoms bonding, a sealed vial in its rings. Loaded on its own, as the
 * stage comes near (loadPactStyles): most visits never get that far.
 */

/** What a style sets of a particle's contribution (formations.ts). */
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
const smoothstep = (edge0: number, edge1: number, value: number) => {
  const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
};
const point = { x: 0, y: 0 };

/** Radii of the three rings round the Pact's vial (marketing.css, `.pact-ring-*`), relative to the outer one. */
const PACT_RINGS = [1, 0.77, 0.52] as const;

/** A finer grain for a particle, its light no bigger than `dot`: even dots, and no bond (scene.ts). */
function fineGrain(particles: FormationParticles, index: number, grain: number, dot: number): number {
  return grain * Math.min(1, dot / (particles.sizes[index] || dot));
}

/**
 * The Pact's dial, in radii of the stage: sixty ticks, every fifth longer,
 * inside a thin ring of dots. The ticks' particles are shared as the ticks
 * are long; DIAL_RING of them draw the ring.
 */
const DIAL_TICKS = 60;
const DIAL_EDGE = 0.92;
const DIAL_TICK = 0.075;
const DIAL_HOUR = 0.16;
const DIAL_WIDTH = 0.008;
const DIAL_RING = 0.3;
/** Light of the ring, of the ticks and of every fifth; and of the hand, which lights each tick as it goes by. */
const DIAL_RING_GLOW = 0.25;
const DIAL_TICK_GLOW = 0.42;
const DIAL_HOUR_GLOW = 0.62;
export const DIAL_HAND_GLOW = 1.5;
/** How long the hand's light lingers behind it, in seconds: on the ticks, and on the ring. */
const DIAL_TRAIL = 2.4;
const DIAL_RING_TRAIL = 7;
const DIAL_GRAIN = 0.65;
const DIAL_DOT = 0.006;

/**
 * Dial: the particles draw a watch's dial round the countdown, whose hand
 * goes round with its seconds, lighting each tick in plasma as it goes by
 * and sweeping the ring with a comet.
 */
function dialContribution(
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
  into.paper = 0.85 * (1 - lit);
  into.grain = fineGrain(particles, index, DIAL_GRAIN, DIAL_DOT);
}

/**
 * The Pact's couple, in radii of the stage: two atoms as the logo's (its
 * orbit tilted, a nucleus, an electron), on a diagonal, the first up on the
 * left, swaying towards each other; between their nuclei, a bond. Shares of
 * the particles: each nucleus, each orbit (COUPLE_ELECTRON of it in the
 * electron), the rest the bond.
 */
const COUPLE_SPAN_X = 0.46;
const COUPLE_SPAN_Y = 0.22;
const COUPLE_ORBIT = 0.4;
const COUPLE_SWAY = 0.06;
const COUPLE_NUCLEUS = 0.13;
const COUPLE_ORBITS = 0.29;
const COUPLE_ELECTRON = 0.14;
/** The bond's beat: from one nucleus to the other in COUPLE_BEAT seconds, once a second, as the countdown ticks. */
const COUPLE_BEAT = 0.55;
export const COUPLE_BEAT_GLOW = 1.4;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
const coupleCenter = { x: 0, y: 0 };

/**
 * Couple: the particles draw two atoms, a bond between them that beats
 * with the countdown's seconds, a pulse of light from one to the other.
 */
function coupleContribution(
  particles: FormationParticles,
  index: number,
  pact: PactFormation,
  time: number,
  into: Look,
): void {
  const along = particles.along[index] ?? 0;
  const lanes = particles.lanes[index] ?? 0;
  const phase = particles.phases[index] ?? 0;
  // From the stage's middle to each nucleus: the first up on the left, the second down on the right.
  const near = 1 - COUPLE_SWAY * (0.5 + 0.5 * Math.sin(time * 0.6));
  const spanX = COUPLE_SPAN_X * near * pact.radius;
  const spanY = COUPLE_SPAN_Y * near * pact.radius;
  const orbit = COUPLE_ORBIT * pact.radius;
  const nucleus = MARK.nucleusRadius * orbit;
  // Since the countdown last ticked, in seconds.
  const beat = 1 - fract(pact.seconds ?? 0);
  const pulse = beat / COUPLE_BEAT;
  let share = lanes;
  // Which of the two atoms.
  const side =
    share < COUPLE_NUCLEUS || (share >= 2 * COUPLE_NUCLEUS && share < 2 * COUPLE_NUCLEUS + COUPLE_ORBITS)
      ? -1
      : 1;
  const center = coupleCenter;
  center.x = pact.x + side * spanX;
  center.y = pact.y - side * spanY;
  into.paper = 0.85;
  if (share < 2 * COUPLE_NUCLEUS) {
    // A nucleus, its particles spread as a sunflower's seeds, flashing as the beat leaves it or reaches it.
    const u = fract(share / COUPLE_NUCLEUS);
    const r = Math.sqrt(u) * nucleus;
    const theta = index * GOLDEN_ANGLE + time * 0.25 * side;
    into.x = center.x + Math.cos(theta) * r;
    into.y = center.y + Math.sin(theta) * r;
    const flash = side < 0 ? Math.exp(-beat / 0.12) : Math.exp(-Math.abs(pulse - 1) / 0.25);
    into.glow = 0.95 + 0.6 * flash;
    into.plasma = side < 0 ? 0.9 : 0;
    into.volt = side < 0 ? 0 : 0.85;
    into.paper = 0;
    into.grain = fineGrain(particles, index, 0.8, 0.008);
    return;
  }
  share -= 2 * COUPLE_NUCLEUS;
  if (share < 2 * COUPLE_ORBITS) {
    // An orbit, each turning its own way, its electron riding it.
    const u = fract(share / COUPLE_ORBITS);
    const electron = fract(time * 0.09 * -side + (side < 0 ? 0 : 0.5));
    const s =
      u < COUPLE_ELECTRON
        ? electron + (u / COUPLE_ELECTRON - 0.5) * 0.035
        : fract(along + time * 0.02 * -side);
    orbitArcPoint(center, orbit, MARK.tilt, s, point);
    const bob = 0.004 * pact.radius * Math.sin(time * 1.5 + phase * TAU);
    into.x = point.x;
    into.y = point.y + bob;
    into.glow = u < COUPLE_ELECTRON ? 1.25 : 0.42;
    into.volt = u < COUPLE_ELECTRON ? 0.75 : 0;
    into.plasma = 0;
    into.paper = u < COUPLE_ELECTRON ? 0.1 : 0.85;
    into.grain = fineGrain(particles, index, 0.65, 0.006);
    return;
  }
  // The bond, from one nucleus to the other, a pulse of light along it once a second.
  const s = (share - 2 * COUPLE_ORBITS) / (1 - 2 * COUPLE_NUCLEUS - 2 * COUPLE_ORBITS);
  const length = Math.hypot(spanX, spanY);
  const ux = spanX / length;
  const uy = -spanY / length;
  const reach = (length - nucleus * 1.4) * (2 * s - 1);
  const across = (phase * 2 - 1) * 0.006 * pact.radius;
  into.x = pact.x + ux * reach - uy * across;
  into.y = pact.y + uy * reach + ux * across;
  const light = pulse <= 1.15 ? Math.exp(-(((s - pulse) / 0.08) ** 2)) : 0;
  into.glow = 0.3 + COUPLE_BEAT_GLOW * light;
  into.plasma = light * (1 - s);
  into.volt = light * s;
  into.paper = 0.85 * (1 - light);
  into.grain = fineGrain(particles, index, 0.65, 0.006);
}

/**
 * The Pact's vial, sealed in the middle of the stage (marketing.css,
 * `.pact-vial`): its half-width and half-height in halves of the stage's
 * side, and how full it is; VIAL_SHARE of the particles in it, the others on
 * the three rings round it.
 */
const VIAL_HALF_WIDTH = 0.24;
const VIAL_HALF_HEIGHT = 0.58;
const VIAL_LEVEL = 0.64;
const VIAL_SHARE = 0.4;

/**
 * Vial: the particles swirl in the sealed vial, plasma at the bottom to volt
 * at the top, and orbit the three rings round it in pairs, each ring whole,
 * in fine dots.
 */
function vialContribution(
  particles: FormationParticles,
  index: number,
  pact: PactFormation,
  time: number,
  into: Look,
): void {
  const pair = index & ~1;
  const lanes = particles.lanes[pair] ?? 0;
  const phase = particles.phases[index] ?? 0;
  if (lanes < VIAL_SHARE) {
    // In the vial: from the bottom up to the level, the round bottom narrowing the lowest rows.
    const half = pact.radius / 0.96;
    const width = VIAL_HALF_WIDTH * half;
    const height = VIAL_HALF_HEIGHT * half;
    // Its partner too, whatever its own lanes: spread over the liquid's height.
    const rise = fract((particles.lanes[index] ?? 0) / VIAL_SHARE) * VIAL_LEVEL * 2 * height;
    const across = rise < width ? Math.sqrt(Math.max(0, width ** 2 - (width - rise) ** 2)) : width;
    const swirl = Math.sin(time * 1.1 + rise * 9 + phase * TAU) * 0.12;
    const u = (particles.along[index] ?? 0) * 2 - 1;
    into.x = pact.x + Math.max(-1, Math.min(1, u + swirl)) * across * 0.78;
    into.y =
      pact.y - height + Math.max(width * 0.18, rise) + Math.sin(time * 1.3 + phase * 23) * 0.01 * height;
    // Plasma at the bottom, volt at the top.
    const top = smoothstep(0.45, 0.95, rise / (VIAL_LEVEL * 2 * height));
    into.glow = 0.9;
    into.plasma = 1 - top;
    into.volt = top;
    into.paper = 0;
    into.grain = fineGrain(particles, index, 0.75, 0.008);
    return;
  }
  // On the rings, each whole: partners ride side by side.
  const along = particles.along[pair] ?? 0;
  const ring = Math.min(2, Math.floor(((lanes - VIAL_SHARE) / (1 - VIAL_SHARE)) * 3));
  const direction = ring % 2 === 0 ? 1 : -1;
  const speed = [0.045, 0.07, 0.03][ring] ?? 0.04;
  const angle = (along + direction * time * speed) * TAU + ((index & 1) === 0 ? -0.03 : 0.03);
  const radius = pact.radius * ((PACT_RINGS[ring] ?? 1) + Math.sin(time * 2 + phase * 13) * 0.01);
  into.x = pact.x + Math.cos(angle) * radius;
  into.y = pact.y + Math.sin(angle) * radius;
  into.glow = 0.55;
  into.paper = 0.85;
  into.grain = fineGrain(particles, index, 0.65, 0.0065);
}

/** The particle `index` in the Pact's drawing, in the style asked for (default: the dial). */
export function pactStyleContribution(
  particles: FormationParticles,
  index: number,
  pact: PactFormation,
  time: number,
  into: Look,
): void {
  if (pact.style === "couple") {
    coupleContribution(particles, index, pact, time, into);
  } else if (pact.style === "vial") {
    vialContribution(particles, index, pact, time, into);
  } else {
    dialContribution(particles, index, pact, time, into);
  }
}
