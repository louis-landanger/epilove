import { MARK } from "./layout";
import { RHONE_PATH, RIVER_MAP, type RiverPath, riverPoint, SAONE_PATH } from "./rivers";

/**
 * Formations of the ion field down the landing page (docs/02-design.md):
 * where each particle heads, how strongly it is pulled there, and how it
 * glows, while the stacked cards of "how it works", the test tubes of the
 * school race and the rings of the Pact go by.
 *
 * Pure functions over the layout, run on the CPU every frame and handed to
 * either backend (GPU storage buffers or instanced attributes): no three.js
 * here, and the same result whatever the renderer.
 */

/** A rectangle of the page in CSS pixels, relative to the viewport. */
export interface PixelBox {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

/** Centre and half extents in world units (half the viewport height = 1, y up). */
export interface WorldBox {
  readonly x: number;
  readonly y: number;
  readonly hw: number;
  readonly hh: number;
}

export interface CardFormation {
  /** 0: free, 1: the formation is fully formed. */
  readonly weight: number;
  readonly box: WorldBox;
  /** Corner radius of the card, in world units. */
  readonly radius: number;
  /**
   * Motif of the current card: 0 a scanning ring (verify), 1 electron shells
   * (profile), 2 a double helix (chemistry). Fractional while cards change.
   */
  readonly step: number;
}

export interface TubeFormation {
  readonly weight: number;
  /** One entry per school, in `SCHOOL_KEYS` order; `null` when that tube is not measured. */
  readonly tubes: ReadonlyArray<{ readonly box: WorldBox; readonly level: number } | null>;
}

export interface PactFormation {
  readonly weight: number;
  readonly x: number;
  readonly y: number;
  /** Radius of the outer ring, in world units. */
  readonly radius: number;
}

/**
 * Two atoms, the hero's couple: mirrored copies of the logo mark drawn to each
 * other by field lines. As `bond` reaches 1 they close in until their orbits
 * hook into each other ("atomes crochus"); as `merge` reaches 1 they melt into
 * a single atom, the logo mark: orbits onto one orbit, nuclei into one
 * nucleus, electrons into one electron.
 */
export interface PairFormation {
  readonly weight: number;
  /** Where the two atoms live. */
  readonly box: WorldBox;
  /** 0: apart, drawn to each other; 1: hooked together. */
  readonly bond: number;
  /** 0: two atoms; 1: merged into the logo mark. */
  readonly merge: number;
  /** Where the logo mark stands once merged: centre and orbit radius. */
  readonly mark: { readonly x: number; readonly y: number; readonly radius: number };
  /** Light of the whole formation, in [0, 1] (default 1). */
  readonly glow?: number;
  /** Light of the nuclei, in [0, 1] (default 1): 0 leaves them dark, hidden behind something. */
  readonly core?: number;
}

/**
 * The Saône and the Rhône through Lyon (rivers.ts), drawn by the particles in
 * `box` (the map, fitted whole): each pair of partners comes down both rivers
 * at once, one particle in each, meets at the Confluence and goes on down
 * the merged river side by side, bonded.
 */
export interface RiversFormation {
  readonly weight: number;
  readonly box: WorldBox;
}

/**
 * The dots of the plan of Lyon (`/apercu/fleuves`, city.ts), taken over by
 * the field as the page scrolls and flown into the logo mark: `progress` 0
 * keeps them on the map (`box`, fitted as for the rivers), 1 has them all
 * merged into `mark`. Only those the plan's own canvas shows fly, within the
 * hero (`hero`: its top, height and sides), fading out towards its foot as
 * there. Not a shape of particles: the field draws these dots on their own
 * (scene.ts, `flightPoint`).
 */
export interface FlightFormation {
  readonly progress: number;
  readonly box: WorldBox;
  readonly hero: {
    readonly top: number;
    readonly height: number;
    readonly left: number;
    readonly right: number;
  };
  readonly mark: { readonly x: number; readonly y: number; readonly radius: number };
}

export interface Formations {
  /** Light of the particles no formation holds, in [0, 1] (default 1): the hero's drifting dust is dim. */
  readonly freeGlow?: number;
  /** Tint of the free particles towards paper white, in [0, 1] (default 0: their school colour). */
  readonly freePaper?: number;
  readonly pair?: PairFormation | null;
  readonly card?: CardFormation | null;
  readonly tubes?: TubeFormation | null;
  readonly pact?: PactFormation | null;
  readonly rivers?: RiversFormation | null;
  readonly flight?: FlightFormation | null;
}

/** The per-particle data the formations need (a subset of `IonFieldLayout`). */
export interface FormationParticles {
  readonly count: number;
  readonly schools: Uint8Array;
  readonly ranks: Float32Array;
  readonly along: Float32Array;
  readonly lanes: Float32Array;
  readonly phases: Float32Array;
  readonly sizes: Float32Array;
}

/** Floats per particle in each output buffer (both are vec4 on the GPU). */
export const FORMATION_STRIDE = 4;

/** Radii of the three Pact rings (marketing.css, `.pact-ring-*`), relative to the outer one. */
const PACT_RINGS = [1, 0.77, 0.52] as const;

/** Shares of each atom of the pair: nucleus, electron, field lines (the rest traces the orbit). */
const PAIR_NUCLEUS = 0.16;
const PAIR_ELECTRON = 0.21;
const PAIR_FIELD = 0.35;
/**
 * Particles at least this big (the "heavy" ones of layout.ts) always sit in
 * the nucleus, whatever their lane: the orbit and the field lines stay fine
 * threads of dust rather than strings of beads.
 */
const PAIR_HEAVY = 0.01;
/** Radius of a nucleus and of an electron's head, in orbit radii. */
export const NUCLEUS_REACH = 0.26;
const ELECTRON_REACH = 0.07;
/** Length of an electron's tail, as a fraction of the orbit. */
const ELECTRON_TAIL = 0.11;
/**
 * Orbit radius (half the viewport height is 1) the dust's light is tuned
 * for. A smaller ring packs the same dust tighter, so it glows less, or it
 * would burn to a solid white band on a phone.
 */
const PAIR_LIGHT_RADIUS = 0.5;

/**
 * Reach of an atom of the pair around its nucleus, in orbit radii: the tilted
 * orbit spans ±0.89 across and ±0.61 up and down; the electron and the bob
 * take a little more.
 */
const ATOM_REACH_X = 0.96;
const ATOM_REACH_Y = 0.7;
/** Half the closest distance between the two atoms while apart, in orbit radii. */
const ATOM_APART = 1.15;

const TAU = Math.PI * 2;
const fract = (value: number) => value - Math.floor(value);
const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const smoothstep = (edge0: number, edge1: number, value: number) => {
  const t = clamp01((value - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
};

/** Converts a viewport rectangle (CSS pixels) to world units for a canvas of `width` × `height`. */
export function toWorldBox(box: PixelBox, width: number, height: number): WorldBox {
  const unit = 2 / height;
  return {
    x: (box.left + box.width / 2 - width / 2) * unit,
    y: (height / 2 - (box.top + box.height / 2)) * unit,
    hw: (box.width / 2) * unit,
    hh: (box.height / 2) * unit,
  };
}

/** Length of the outline of a rounded rectangle pushed out by `offset`. */
export function contourLength(box: WorldBox, radius: number, offset: number): number {
  const corner = Math.min(radius, box.hw, box.hh);
  const straightX = 2 * (box.hw - corner);
  const straightY = 2 * (box.hh - corner);
  return 2 * straightX + 2 * straightY + TAU * Math.max(0, corner + offset);
}

/**
 * Point at the fraction `s` of the outline of a rounded rectangle pushed out
 * by `offset`, clockwise from the left end of the top edge. Arc length is
 * uniform along the outline, so evenly spread `s` give evenly spaced points.
 * Allocation-free: it runs for thousands of particles every frame.
 */
export function contourPoint(
  box: WorldBox,
  radius: number,
  offset: number,
  s: number,
  out: { x: number; y: number },
): void {
  const corner = Math.min(radius, box.hw, box.hh);
  const reach = Math.max(0, corner + offset);
  const sx = box.hw - corner;
  const sy = box.hh - corner;
  const lengthX = 2 * sx;
  const lengthY = 2 * sy;
  const arc = (Math.PI / 2) * reach;
  let t = fract(s) * (2 * lengthX + 2 * lengthY + 4 * arc);
  if (t <= lengthX) {
    out.x = box.x - sx + t;
    out.y = box.y + sy + reach;
    return;
  }
  t -= lengthX;
  if (t <= arc) {
    arcPoint(box, sx, sy, Math.PI / 2, t, reach, out);
    return;
  }
  t -= arc;
  if (t <= lengthY) {
    out.x = box.x + sx + reach;
    out.y = box.y + sy - t;
    return;
  }
  t -= lengthY;
  if (t <= arc) {
    arcPoint(box, sx, -sy, 0, t, reach, out);
    return;
  }
  t -= arc;
  if (t <= lengthX) {
    out.x = box.x + sx - t;
    out.y = box.y - sy - reach;
    return;
  }
  t -= lengthX;
  if (t <= arc) {
    arcPoint(box, -sx, -sy, -Math.PI / 2, t, reach, out);
    return;
  }
  t -= arc;
  if (t <= lengthY) {
    out.x = box.x - sx - reach;
    out.y = box.y - sy + t;
    return;
  }
  arcPoint(box, -sx, sy, Math.PI, Math.min(t - lengthY, arc), reach, out);
}

/** Point `t` along a corner arc centred on (box.x + cx, box.y + cy), clockwise from `start`. */
function arcPoint(
  box: WorldBox,
  cx: number,
  cy: number,
  start: number,
  t: number,
  reach: number,
  out: { x: number; y: number },
): void {
  const angle = start - (reach > 0 ? t / reach : 0);
  out.x = box.x + cx + Math.cos(angle) * reach;
  out.y = box.y + cy + Math.sin(angle) * reach;
}

/** Largest weight among the formations: 0 when the field drifts freely. */
export function formationStrength(formations: {
  readonly pair?: { readonly weight: number } | null;
  readonly card?: { readonly weight: number } | null;
  readonly tubes?: { readonly weight: number } | null;
  readonly pact?: { readonly weight: number } | null;
  readonly rivers?: { readonly weight: number } | null;
}): number {
  return Math.max(
    formations.pair?.weight ?? 0,
    formations.card?.weight ?? 0,
    formations.tubes?.weight ?? 0,
    formations.pact?.weight ?? 0,
    formations.rivers?.weight ?? 0,
  );
}

interface Contribution {
  x: number;
  y: number;
  /** Pull towards the target in [0, 1], before the formation weight. */
  pull: number;
  glow: number;
  volt: number;
  plasma: number;
  /** Tint towards paper white (the orbits of the pair). */
  paper: number;
  /** Vertical move of the shape's element since the previous frame (world units). */
  carry: number;
  /** Size of the particle's light (1: its own); a formation may ask for finer grains. */
  grain: number;
}

const point = { x: 0, y: 0 };

/** Card motifs: the outline of the current card, traced three ways. */
function cardContribution(
  particles: FormationParticles,
  index: number,
  card: CardFormation,
  previous: CardFormation | null,
  time: number,
  unit: number,
  into: Contribution,
): boolean {
  const pair = index & ~1;
  const along = particles.along[index] ?? 0;
  const phase = particles.phases[index] ?? 0;
  const scan = 1 - smoothstep(0, 1, card.step);
  const helix = smoothstep(1, 2, card.step);
  const shells = Math.max(0, 1 - scan - helix);
  into.x = 0;
  into.y = 0;
  into.glow = 0;
  into.volt = 0;
  into.plasma = 0;
  into.paper = 0;
  into.carry = previous ? card.box.y - previous.box.y : 0;

  if (scan > 0.001) {
    // Verify: one ring that zigzags around the card, swept by two pulses of light.
    const s = fract(along + time * 0.035);
    const base = 16 * unit;
    const distance = s * contourLength(card.box, card.radius, base);
    const offset = base + 7 * unit * Math.sin((distance / (36 * unit)) * TAU + time * 3);
    contourPoint(card.box, card.radius, offset, s, point);
    const head = fract(time * 0.11);
    const pulse = Math.exp(-fract(s - head) * 16) + Math.exp(-fract(s - head - 0.5) * 16);
    into.x += point.x * scan;
    into.y += point.y * scan;
    into.glow += (0.35 + 1.1 * pulse) * scan;
    into.volt += 0.55 * scan;
  }
  if (shells > 0.001) {
    // Profile: three electron shells around the element card, turning in alternate directions.
    const shell = Math.floor(fract(along * 3.7) * 3);
    const direction = shell % 2 === 0 ? 1 : -1;
    const s = fract(along + direction * time * (0.022 + 0.012 * shell));
    const offset = (12 + 22 * shell + 3 * Math.sin(time * 1.3 + phase * TAU)) * unit;
    contourPoint(card.box, card.radius, offset, s, point);
    into.x += point.x * shells;
    into.y += point.y * shells;
    into.glow += (0.85 - 0.12 * shell) * shells;
  }
  if (helix > 0.001) {
    // Chemistry: partners ride the two strands of a double helix, bonded across.
    const strand = index & 1;
    const s = fract((particles.along[pair] ?? 0) + time * 0.02);
    const base = 34 * unit;
    const distance = s * contourLength(card.box, card.radius, base);
    const offset =
      base + 22 * unit * Math.sin((distance / (170 * unit)) * TAU + time * 1.6 + strand * Math.PI);
    contourPoint(card.box, card.radius, offset, s, point);
    into.x += point.x * helix;
    into.y += point.y * helix;
    into.glow += 0.65 * helix;
    into.plasma += (strand === 0 ? 0.6 : 0) * helix;
    into.volt += (strand === 1 ? 0.55 : 0) * helix;
  }
  into.pull = 1;
  return true;
}

/** Test tubes: each particle heads for its school's tube, filled from the bottom up to the level. */
function tubeContribution(
  particles: FormationParticles,
  index: number,
  formation: TubeFormation,
  previous: TubeFormation | null,
  time: number,
  into: Contribution,
): boolean {
  const school = particles.schools[index] ?? 0;
  const tube = formation.tubes[school];
  if (!tube) {
    return false;
  }
  const before = previous?.tubes[school];
  into.carry = before ? tube.box.y - before.box.y : 0;
  into.paper = 0;
  const { box } = tube;
  const level = clamp01(tube.level);
  const rank = particles.ranks[index] ?? 0;
  const lane = particles.lanes[index] ?? 0;
  const phase = particles.phases[index] ?? 0;
  const height = box.hh * 2;
  const bottom = box.y - box.hh;
  into.volt = 0;
  into.plasma = 0;

  if (rank < level) {
    // In the liquid: the round bottom narrows the lowest rows.
    const rise = Math.max(rank * height, box.hw * 0.18);
    const half = rise < box.hw ? Math.sqrt(Math.max(0, box.hw ** 2 - (box.hw - rise) ** 2)) : box.hw;
    const usable = half * 0.68;
    const sway = Math.sin(time * 1.9 + phase * 37) * 0.14;
    into.x = box.x + Math.max(-1, Math.min(1, lane * 2 - 1 + sway)) * usable;
    into.y = Math.min(
      bottom + rise + Math.sin(time * 1.3 + phase * 23) * 0.012 * height,
      bottom + level * height,
    );
    into.pull = 1;
    into.glow = 1;
    return true;
  }
  // Not poured yet: a slow plume above the mouth of the tube, waiting for sign-ups
  // (narrow enough not to merge with the next tube's).
  const angle = lane * TAU + time * (0.3 + 0.2 * phase);
  const radius = box.hw * (0.25 + 0.95 * Math.sqrt(fract((particles.along[index] ?? 0) * 11.7)));
  into.x = box.x + Math.cos(angle) * radius;
  into.y = box.y + box.hh + box.hw * 2.4 + Math.sin(angle) * radius * 0.9;
  into.pull = 1;
  into.glow = 0.3;
  return true;
}

/** Pact: bonded pairs orbiting the three rings. */
function pactContribution(
  particles: FormationParticles,
  index: number,
  pact: PactFormation,
  previous: PactFormation | null,
  time: number,
  into: Contribution,
): boolean {
  const pair = index & ~1;
  const along = particles.along[pair] ?? 0;
  const ring = Math.floor(fract(along * 2.3) * 3);
  const direction = ring % 2 === 0 ? 1 : -1;
  const speed = [0.045, 0.07, 0.03][ring] ?? 0.04;
  // Partners ride side by side, close enough for their bond to light up.
  const angle = (along + direction * time * speed) * TAU + ((index & 1) === 0 ? -0.03 : 0.03);
  const phase = particles.phases[index] ?? 0;
  const radius = pact.radius * ((PACT_RINGS[ring] ?? 1) + Math.sin(time * 2 + phase * 13) * 0.012);
  into.x = pact.x + Math.cos(angle) * radius;
  into.y = pact.y + Math.sin(angle) * radius;
  into.pull = 1;
  into.glow = 0.45;
  into.volt = 0;
  into.plasma = 0;
  into.paper = 0;
  into.carry = previous ? pact.y - previous.y : 0;
  return true;
}

/** Speed of the rivers on the map, in kilometres per second, and its spread between pairs (± half). */
const RIVER_SPEED = 0.38;
const RIVER_SPREAD = 0.3;
const RIVER_SLOWEST = RIVER_SPEED * (1 - RIVER_SPREAD / 2);
/**
 * Seconds a pair takes, at its slowest, from the farther source to the
 * Confluence, then out of sight down the merged river: its whole journey,
 * after which it starts again from the sources.
 */
const RIVER_UP = Math.max(SAONE_PATH.confluence, RHONE_PATH.confluence) / RIVER_SLOWEST;
const RIVER_CYCLE = RIVER_UP + (SAONE_PATH.total - SAONE_PATH.confluence) / RIVER_SLOWEST;
/** Half widths of the rivers on the map, in kilometres (wider than in Lyon, to be seen). */
const SAONE_HALF = 0.07;
const RHONE_HALF = 0.1;
const MERGED_HALF = 0.16;
/** Over how many kilometres past the Confluence the two waters run side by side before they mix. */
const SIDE_BY_SIDE = 2.4;
const MAP_WIDTH = RIVER_MAP.maxX - RIVER_MAP.minX;
const MAP_HEIGHT = RIVER_MAP.maxY - RIVER_MAP.minY;
const MAP_X = (RIVER_MAP.minX + RIVER_MAP.maxX) / 2;
const MAP_Y = (RIVER_MAP.minY + RIVER_MAP.maxY) / 2;

const onRiver = { x: 0, y: 0, nx: 0, ny: 0 };

/**
 * How the map (RIVER_MAP) fits, centred and whole, in `box` (world units):
 * a kilometre in world units, and where 0 km, 0 km lands.
 */
export function riverMapTransform(box: WorldBox): { scale: number; x: number; y: number } {
  const scale = Math.min((2 * box.hw) / MAP_WIDTH, (2 * box.hh) / MAP_HEIGHT);
  return { scale, x: box.x - MAP_X * scale, y: box.y - MAP_Y * scale };
}

/** How far along its course a particle of the rivers is at `time`, in kilometres (may run past either end). */
export function riverDistance(particles: FormationParticles, index: number, time: number): number {
  const pair = index & ~1;
  const path: RiverPath = (index & 1) === 1 ? RHONE_PATH : SAONE_PATH;
  const speed = RIVER_SPEED * (1 - RIVER_SPREAD / 2 + RIVER_SPREAD * (particles.phases[pair] ?? 0));
  // Partners share their clock and their speed: they reach the Confluence at the same moment.
  const sinceConfluence = fract((particles.along[pair] ?? 0) + time / RIVER_CYCLE) * RIVER_CYCLE - RIVER_UP;
  return path.confluence + sinceConfluence * speed;
}

/**
 * The rivers: even particles come down the Saône (plasma), odd ones down the
 * Rhône (volt). Past the Confluence, the two waters run side by side, then
 * mix, each pair of partners side by side, bonded. Before a particle comes
 * into sight it waits at its source, dark, and once out of sight it flies
 * back there, dark too.
 */
function riversContribution(
  particles: FormationParticles,
  index: number,
  rivers: RiversFormation,
  previous: RiversFormation | null,
  time: number,
  into: Contribution,
): boolean {
  const rhone = (index & 1) === 1;
  const path = rhone ? RHONE_PATH : SAONE_PATH;
  const s = Math.min(path.total, Math.max(0, riverDistance(particles, index, time)));
  riverPoint(path, s, onRiver);
  const lane = (particles.lanes[index] ?? 0.5) * 2 - 1;
  const past = s - path.confluence;
  let offset: number;
  if (past <= 0) {
    offset = lane * (rhone ? RHONE_HALF : SAONE_HALF);
  } else {
    const mixed = smoothstep(0, SIDE_BY_SIDE, past);
    offset = ((rhone ? 0.5 : -0.5) * (1 - mixed) + lane * (0.5 + 0.5 * mixed)) * MERGED_HALF;
  }
  offset += Math.sin(time * 1.3 + (particles.phases[index] ?? 0) * TAU) * 0.012;
  const { box } = rivers;
  const map = riverMapTransform(box);
  into.x = map.x + (onRiver.x + offset * onRiver.nx) * map.scale;
  into.y = map.y + (onRiver.y + offset * onRiver.ny) * map.scale;
  into.pull = 1;
  into.glow =
    smoothstep(path.enters * 0.4, path.enters, s) *
    (1 - smoothstep(path.leaves, path.leaves + (path.total - path.leaves) * 0.6, s));
  into.plasma = rhone ? 0 : 0.9;
  into.volt = rhone ? 0.85 : 0;
  into.paper = 0;
  into.carry = previous ? box.y - previous.box.y : 0;
  return true;
}

/** Point at angle `theta` on an atom's orbit (the logo's ellipse) centred on `center`, tilted by `tilt`. */
export function orbitPoint(
  center: { x: number; y: number },
  radius: number,
  tilt: number,
  theta: number,
  out: { x: number; y: number },
): void {
  const ex = Math.cos(theta) * radius;
  const ey = Math.sin(theta) * radius * MARK.orbitMinor;
  out.x = center.x + ex * Math.cos(tilt) - ey * Math.sin(tilt);
  out.y = center.y + ex * Math.sin(tilt) + ey * Math.cos(tilt);
}

const shared = { x: 0, y: 0 };

const ORBIT_SAMPLES = 1024;

/**
 * Angle of the orbit's ellipse at every 1/ORBIT_SAMPLES of its arc length
 * (plus the end). Dust spread evenly in angle bunches up at the ends of the
 * major axis; spread evenly in arc length it traces an even thread.
 */
const ORBIT_THETA = (() => {
  const fine = 4096;
  const lengths = new Float64Array(fine + 1);
  let px = 1;
  let py = 0;
  for (let i = 1; i <= fine; i += 1) {
    const t = (TAU * i) / fine;
    const x = Math.cos(t);
    const y = MARK.orbitMinor * Math.sin(t);
    lengths[i] = (lengths[i - 1] ?? 0) + Math.hypot(x - px, y - py);
    px = x;
    py = y;
  }
  const total = lengths[fine] ?? 1;
  const table = new Float32Array(ORBIT_SAMPLES + 1);
  let i = 0;
  for (let k = 0; k <= ORBIT_SAMPLES; k += 1) {
    const target = (total * k) / ORBIT_SAMPLES;
    while (i < fine - 1 && (lengths[i + 1] ?? total) < target) {
      i += 1;
    }
    const l0 = lengths[i] ?? 0;
    const l1 = lengths[i + 1] ?? total;
    const f = l1 > l0 ? (target - l0) / (l1 - l0) : 0;
    table[k] = (TAU * (i + f)) / fine;
  }
  return table;
})();

/** Angle on the orbit at the fraction `s` of its arc length, counter-clockwise from the major axis. */
export function orbitTheta(s: number): number {
  const u = fract(s) * ORBIT_SAMPLES;
  const k = Math.floor(u);
  const from = ORBIT_THETA[k] ?? 0;
  const to = ORBIT_THETA[k + 1] ?? TAU;
  return from + (to - from) * (u - k);
}

/** Point at the fraction `s` of the arc length of an atom's orbit (see `orbitPoint`). */
export function orbitArcPoint(
  center: { x: number; y: number },
  radius: number,
  tilt: number,
  s: number,
  out: { x: number; y: number },
): void {
  orbitPoint(center, radius, tilt, orbitTheta(s), out);
}

/**
 * How close to the viewer a point of the orbit is, in [0, 1]: the ring is a
 * circle seen at an angle, its lower half (before the tilt) the near one. The
 * same for an atom and its mirror image, since mirroring keeps the sine.
 */
const orbitNear = (theta: number) => 0.5 - 0.5 * Math.sin(theta);

/**
 * Orbit radius of the two atoms in a stage of half extents `hw` × `hh`: as
 * large as fits with both atoms inside it, in opposite corners, apart.
 * Centred `ATOM_REACH` from the edges, they stand
 * hypot(hw - ATOM_REACH_X r, hh - ATOM_REACH_Y r) from the centre: the
 * largest r for which that is still `ATOM_APART r` solves a quadratic.
 */
export function pairAtomSize(hw: number, hh: number): number {
  const a = ATOM_REACH_X ** 2 + ATOM_REACH_Y ** 2 - ATOM_APART ** 2;
  const d = ATOM_REACH_X * hw + ATOM_REACH_Y * hh;
  const c = hw * hw + hh * hh;
  // Smallest positive root of a r² - 2 d r + c, in its stable form (none in an empty box).
  const apart = c > 0 ? c / (d + Math.sqrt(Math.max(0, d * d - a * c))) : 0;
  return Math.max(0, Math.min(hw / ATOM_REACH_X, hh / ATOM_REACH_Y, apart));
}

export interface PairGeometry {
  /** Orbit radius of each atom. */
  readonly radius: number;
  /** Eased merge: 0 two atoms, 1 the logo mark. */
  readonly merged: number;
  /** Eased bond: 0 apart, 1 hooked together. */
  readonly bonded: number;
  /** Nuclei of the left atom and of its mirror image. */
  readonly a: { readonly x: number; readonly y: number };
  readonly b: { readonly x: number; readonly y: number };
  /** Tilt of the right atom's orbit: the left one's mirror image, until they merge. */
  readonly tiltB: number;
}

/**
 * Where the two atoms of the pair stand (also draws the static posters). Apart,
 * in opposite corners of their stage: side by side in a wide one, on a diagonal
 * in a tall one. Bonding, they close in, level with each other, until their
 * orbits hook together; merging, they melt into the logo mark.
 */
export function pairGeometry(pair: Omit<PairFormation, "weight">, time: number): PairGeometry {
  const { box, mark } = pair;
  const size = pairAtomSize(box.hw, box.hh);
  const spanX = Math.max(0, box.hw - ATOM_REACH_X * size);
  const spanY = Math.max(0, box.hh - ATOM_REACH_Y * size);
  const apart = Math.hypot(spanX, spanY) || size * ATOM_APART;
  const hooked = size * 0.62;
  const bonded = smoothstep(0, 1, pair.bond);
  const merged = smoothstep(0, 1, pair.merge);
  // From their corners to side by side.
  const dx = spanX / apart + (1 - spanX / apart) * bonded;
  const dy = (spanY / apart) * (1 - bonded);
  const norm = Math.hypot(dx, dy) || 1;
  // Even apart, they lean towards each other: the gap breathes (inwards, so they stay in their stage).
  const half =
    (apart + (hooked - apart) * bonded) * (1 - 0.035 * (1 - bonded) * (0.5 + 0.5 * Math.sin(time * 0.7)));
  const bob = size * 0.04 * (1 - merged);
  const ax = box.x - (dx / norm) * half;
  const ay = box.y + (dy / norm) * half + bob * Math.sin(time * 0.8);
  const bx = box.x + (dx / norm) * half;
  const by = box.y - (dy / norm) * half + bob * Math.sin(time * 0.8 + 2.1);
  return {
    radius: size + (mark.radius - size) * merged,
    merged,
    bonded,
    a: { x: ax + (mark.x - ax) * merged, y: ay + (mark.y - ay) * merged },
    b: { x: bx + (mark.x - bx) * merged, y: by + (mark.y - by) * merged },
    tiltB: -MARK.tilt + 2 * MARK.tilt * merged,
  };
}

/** Number of field lines between the two atoms. */
export const PAIR_FIELD_LINES = 3;

/**
 * Point at `s` in [0, 1] along field line `line` (0 is the innermost, and it
 * may be fractional) from the left atom's nucleus to the right one's. The
 * lines are the field of two opposite charges, which in the plane are circular
 * arcs through both of them: they leave each nucleus steeply, clear of the
 * title between the atoms, and arch over it (into the empty corner, when the
 * atoms stand on a diagonal). As the atoms hook together the arcs flatten
 * into the bond between the two nuclei.
 */
export function pairFieldPoint(
  geometry: PairGeometry,
  line: number,
  s: number,
  out: { x: number; y: number },
): void {
  const { a, b, radius, bonded } = geometry;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length = Math.hypot(dx, dy) || 1;
  const ux = dx / length;
  const uy = dy / length;
  // The side the arcs bulge to: the chord turned a quarter turn (up, for atoms side by side).
  const nx = -uy;
  const ny = ux;
  // Sagitta: a share of the distance between the atoms, but no higher above
  // them than their size (they stand under the site header); a bond once hooked.
  const sagitta = Math.min(length * (0.24 + 0.03 * line), radius * (0.95 + 0.12 * line)) * (1 - 0.8 * bonded);
  const circle = (length * length * 0.25 + sagitta * sagitta) / (2 * sagitta);
  const alpha = Math.asin(Math.min(1, length / (2 * circle)));
  // The visible arc starts at the edge of each nucleus.
  const trim = Math.min(alpha * 0.45, (radius * 0.32) / circle);
  const phi = -alpha + trim + 2 * (alpha - trim) * s;
  const cx = (a.x + b.x) / 2 - nx * (circle - sagitta);
  const cy = (a.y + b.y) / 2 - ny * (circle - sagitta);
  const across = Math.cos(phi) * circle;
  const along = Math.sin(phi) * circle;
  out.x = cx + across * nx + along * ux;
  out.y = cy + across * ny + along * uy;
}

/**
 * The pair: even particles make the left atom (plasma nucleus, volt
 * electron), odd ones its mirror image (volt nucleus, plasma electron).
 * Each fills its nucleus, rides its electron, flows along the field lines
 * that bind the two nuclei, or traces its tilted orbit. The mirror image of a
 * point at the arc fraction `s` of the left orbit sits at `0.5 - s` on the
 * right one, hence the half-turn offsets and the opposite direction.
 */
function pairContribution(
  particles: FormationParticles,
  index: number,
  pair: PairFormation,
  geometry: PairGeometry,
  previous: PairFormation | null,
  time: number,
  into: Contribution,
): boolean {
  const { radius, merged, a, b, tiltB } = geometry;
  const left = (index & 1) === 0;
  const self = left ? a : b;
  const direction = left ? 1 : -1;
  const tilt = left ? MARK.tilt : tiltB;
  const lane = particles.lanes[index] ?? 0;
  const along = particles.along[index] ?? 0;
  const phase = particles.phases[index] ?? 0;
  const heavy = (particles.sizes[index] ?? 0) >= PAIR_HEAVY;
  const packed = Math.min(1, Math.max(0.4, radius / PAIR_LIGHT_RADIUS));
  into.volt = 0;
  into.plasma = 0;
  into.paper = 0;
  into.pull = 1;
  // The stage moves with the page; once merged, the mark goes where it is placed (pinned in the
  // viewport, or scrolling with what it surrounds).
  into.carry = previous
    ? (pair.box.y - previous.box.y) * (1 - merged) + (pair.mark.y - previous.mark.y) * merged
    : 0;

  if (heavy || lane < PAIR_NUCLEUS) {
    // Nucleus: a dense core in a soft corona, breathing and slowly swirling.
    // The angle comes from the particle's random phase and the radius from its
    // low-discrepancy `along`: evenly filled, without the lattice of arms that
    // two correlated sequences would draw. The heavy particles stay in the core.
    const reach = radius * NUCLEUS_REACH * (1 + 0.05 * Math.sin(time * 1.4 + (left ? 0 : 1.7)));
    const depth = heavy ? along * 0.4 : along;
    const r = reach * depth ** 0.7;
    const angle = TAU * phase + time * (0.14 - 0.1 * depth);
    into.x = self.x + Math.cos(angle) * r;
    into.y = self.y + Math.sin(angle) * r;
    into.glow = (0.5 + 0.8 * (1 - depth)) * (pair.core ?? 1);
    // Plasma and volt nuclei; once merged, the plasma nucleus of the mark.
    if (left) {
      into.plasma = 0.9;
    } else {
      into.volt = 0.85 * (1 - merged);
      into.plasma = 0.9 * merged;
    }
    return true;
  }
  if (lane < PAIR_ELECTRON) {
    // Electron: a bright head that really travels along the orbit, trailing
    // a short tail of fading dust; dimmer on the far side of the ring. Once
    // merged, the right atom's electron joins the left one's: the mark has one.
    const head = fract(direction * time * 0.12 + (left ? 0 : 0.5));
    const headMark = fract(time * 0.12);
    const k = (lane - PAIR_NUCLEUS) / (PAIR_ELECTRON - PAIR_NUCLEUS);
    const inHead = k < 0.45;
    // How far back along the tail, 0 at the head: denser near the head.
    const back = inHead ? 0 : ((k - 0.45) / 0.55) ** 2 * ELECTRON_TAIL;
    orbitArcPoint(self, radius, tilt, head - direction * back, point);
    orbitArcPoint(a, radius, MARK.tilt, headMark - back, shared);
    const cx = left ? point.x : point.x + (shared.x - point.x) * merged;
    const cy = left ? point.y : point.y + (shared.y - point.y) * merged;
    const angle = TAU * phase;
    let offset: number;
    if (inHead) {
      offset = radius * ELECTRON_REACH * Math.sqrt(k / 0.45);
      into.glow = 1.25;
    } else {
      // The tail widens and fades away from the head.
      const fade = 1 - back / ELECTRON_TAIL;
      offset = radius * (0.01 + 0.03 * (1 - fade)) * (phase - 0.5) * 2;
      into.glow = (0.08 + 0.9 * fade * fade) * packed;
    }
    into.glow *= 0.6 + 0.4 * orbitNear(orbitTheta(head - direction * back));
    into.x = cx + Math.cos(angle) * offset;
    into.y = cy + Math.sin(angle) * offset;
    if (left) {
      into.volt = 0.9;
    } else {
      into.plasma = 0.9 * (1 - merged);
      into.volt = 0.9 * merged;
    }
    return true;
  }
  if (lane < PAIR_FIELD) {
    // Field lines: a soft band of three arcs over the title (into the empty
    // corner on narrow screens). Dim dust drifts along them, one line out of
    // two the other way, each line scattered a little across its width; a
    // bright pulse runs down each line, in the colour of the atom it leaves.
    const share = (lane - PAIR_ELECTRON) / (PAIR_FIELD - PAIR_ELECTRON);
    const line = Math.min(PAIR_FIELD_LINES - 1, Math.floor(share * PAIR_FIELD_LINES));
    const flow = line % 2 === 0 ? 1 : -1;
    const s = fract(along + flow * time * 0.06);
    pairFieldPoint(geometry, line + (phase - 0.5) * 0.5, s, shared);
    const pulseHead = fract(flow * time * 0.2 + line * 0.37);
    const pulse = Math.exp(-fract(flow * (pulseHead - s)) * 11);
    // Merging, the field lines join the orbit rather than crush into the nucleus.
    orbitArcPoint(self, radius, tilt, along + direction * time * 0.04, point);
    into.x = shared.x + (point.x - shared.x) * merged;
    into.y = shared.y + (point.y - shared.y) * merged;
    const lit = (0.38 + 1.1 * pulse) * packed;
    into.glow = lit + (0.55 * packed - lit) * merged;
    into.paper = (0.75 - 0.6 * pulse) * (1 - merged) + 0.85 * merged;
    if (flow > 0) {
      into.plasma = 0.9 * pulse * (1 - merged);
    } else {
      into.volt = 0.9 * pulse * (1 - merged);
    }
    return true;
  }
  // Orbit: a fine thread of dust evenly spread along the tilted ellipse, a
  // little thicker in its middle, turning; the near half of the ring a touch
  // brighter, so it reads as a circle seen at an angle.
  const s = fract(along + direction * time * 0.04);
  const spread = (phase - 0.5) * 2;
  orbitArcPoint(self, radius * (1 + 0.02 * spread * Math.abs(spread)), tilt, s, point);
  into.x = point.x;
  into.y = point.y;
  into.glow = (0.42 + 0.3 * orbitNear(orbitTheta(s))) * packed;
  into.paper = 0.85;
  return true;
}

const contribution: Contribution = {
  x: 0,
  y: 0,
  pull: 0,
  glow: 1,
  volt: 0,
  plasma: 0,
  paper: 0,
  carry: 0,
  grain: 1,
};
const sum = { x: 0, y: 0, total: 0, glow: 0, volt: 0, plasma: 0, paper: 0, carry: 0, grain: 0 };

/** Adds the current `contribution`, weighted by its formation, to `sum`. */
function accumulate(weight: number): void {
  // A target that is not a number would lose the particle for good: such a contribution is left out.
  if (!Number.isFinite(contribution.x) || !Number.isFinite(contribution.y)) {
    contribution.grain = 1;
    return;
  }
  const w = weight * contribution.pull;
  sum.x += contribution.x * w;
  sum.y += contribution.y * w;
  sum.glow += contribution.glow * w;
  sum.volt += contribution.volt * w;
  sum.plasma += contribution.plasma * w;
  sum.paper += contribution.paper * w;
  sum.carry += contribution.carry * w;
  sum.grain += contribution.grain * w;
  sum.total += w;
  // The grain is opt-in: back to the default for the next formation.
  contribution.grain = 1;
}

/**
 * Writes, for every particle:
 * - `targets`: x, y (world units), pull in [0, 1] (0 drifts freely), carry;
 * - `looks`: volt tint, plasma tint, glow multiplier, paper tint;
 * - `grains` (optional): size of each particle's light (1: its own).
 * The carry is how far the particle's shape moved up or down since
 * `previous` (the formations of the last frame): the simulation moves the
 * particle by as much, so shapes stay glued to their element while the page
 * scrolls, and the springs only animate the motifs.
 * `unit` is one CSS pixel in world units: motifs are designed in pixels.
 */
export function writeFormations(
  targets: Float32Array,
  looks: Float32Array,
  particles: FormationParticles,
  formations: Formations,
  previous: Formations | null,
  time: number,
  unit: number,
  grains?: Float32Array,
): void {
  const pair = formations.pair && formations.pair.weight > 0.001 ? formations.pair : null;
  const card = formations.card && formations.card.weight > 0.001 ? formations.card : null;
  const tubes = formations.tubes && formations.tubes.weight > 0.001 ? formations.tubes : null;
  const pact = formations.pact && formations.pact.weight > 0.001 ? formations.pact : null;
  const rivers = formations.rivers && formations.rivers.weight > 0.001 ? formations.rivers : null;
  const freeGlow = formations.freeGlow ?? 1;
  const freePaper = formations.freePaper ?? 0;

  // Where the two atoms stand this frame: the same for every particle.
  const geometry = pair ? pairGeometry(pair, time) : null;

  for (let index = 0; index < particles.count; index += 1) {
    sum.x = 0;
    sum.y = 0;
    sum.total = 0;
    sum.glow = 0;
    sum.volt = 0;
    sum.plasma = 0;
    sum.paper = 0;
    sum.carry = 0;
    sum.grain = 0;
    if (
      pair &&
      geometry &&
      pairContribution(particles, index, pair, geometry, previous?.pair ?? null, time, contribution)
    ) {
      contribution.glow *= pair.glow ?? 1;
      accumulate(pair.weight);
    }
    if (card && cardContribution(particles, index, card, previous?.card ?? null, time, unit, contribution)) {
      accumulate(card.weight);
    }
    if (tubes && tubeContribution(particles, index, tubes, previous?.tubes ?? null, time, contribution)) {
      accumulate(tubes.weight);
    }
    if (pact && pactContribution(particles, index, pact, previous?.pact ?? null, time, contribution)) {
      accumulate(pact.weight);
    }
    if (
      rivers &&
      riversContribution(particles, index, rivers, previous?.rivers ?? null, time, contribution)
    ) {
      accumulate(rivers.weight);
    }
    const { x, y, total, glow, volt, plasma, paper, carry, grain } = sum;

    // Between two formations their weights add up to 1: the particle glides
    // from one shape to the next, held all the way, never set free.
    const offset = index * FORMATION_STRIDE;
    if (total > 0) {
      const share = Math.min(1, total);
      targets[offset] = x / total;
      targets[offset + 1] = y / total;
      targets[offset + 2] = share;
      targets[offset + 3] = (carry / total) * share;
      looks[offset] = (volt / total) * share;
      looks[offset + 1] = (plasma / total) * share;
      looks[offset + 2] = freeGlow + (glow / total - freeGlow) * share;
      looks[offset + 3] = freePaper + (paper / total - freePaper) * share;
      if (grains) {
        grains[index] = 1 + (grain / total - 1) * share;
      }
    } else {
      targets[offset + 2] = 0;
      targets[offset + 3] = 0;
      looks[offset] = 0;
      looks[offset + 1] = 0;
      looks[offset + 2] = freeGlow;
      looks[offset + 3] = freePaper;
      if (grains) {
        grains[index] = 1;
      }
    }
  }
}

/** Formations as the page measures them: viewport rectangles in CSS pixels. */
export interface ViewportFormations {
  /** Light of the particles no formation holds, in [0, 1] (default 1), and their tint towards paper white (default 0). */
  readonly freeGlow?: number;
  readonly freePaper?: number;
  /** The two atoms of the logo mark (centre and radius in pixels), in a stage where they first stand apart. */
  readonly pair?: {
    readonly weight: number;
    readonly box: PixelBox;
    readonly bond: number;
    readonly merge: number;
    readonly mark: { readonly x: number; readonly y: number; readonly radius: number };
    readonly glow?: number;
    readonly core?: number;
  } | null;
  readonly card?: {
    readonly weight: number;
    readonly box: PixelBox;
    /** Corner radius, in CSS pixels. */
    readonly radius: number;
    readonly step: number;
  } | null;
  readonly tubes?: {
    readonly weight: number;
    readonly tubes: ReadonlyArray<{ readonly box: PixelBox; readonly level: number } | null>;
  } | null;
  /** The Pact stage: the rings are inscribed in it. */
  readonly pact?: { readonly weight: number; readonly box: PixelBox } | null;
  /** The map of the rivers (rivers.ts), fitted whole in its box. */
  readonly rivers?: { readonly weight: number; readonly box: PixelBox } | null;
  /** The plan's dots flying into the logo mark (FlightFormation): the map, the hero, the mark in pixels. */
  readonly flight?: {
    readonly progress: number;
    readonly box: PixelBox;
    readonly hero: PixelBox;
    readonly mark: { readonly x: number; readonly y: number; readonly radius: number };
  } | null;
}

/** Converts measured formations to world units for a canvas of `width` × `height` CSS pixels. */
export function toWorldFormations(formations: ViewportFormations, width: number, height: number): Formations {
  const unit = 2 / height;
  const { pair, card, tubes, pact, rivers, flight } = formations;
  const pactBox = pact ? toWorldBox(pact.box, width, height) : null;
  return {
    ...(formations.freeGlow === undefined ? {} : { freeGlow: formations.freeGlow }),
    ...(formations.freePaper === undefined ? {} : { freePaper: formations.freePaper }),
    pair: pair
      ? {
          weight: pair.weight,
          box: toWorldBox(pair.box, width, height),
          bond: pair.bond,
          merge: pair.merge,
          mark: {
            x: (pair.mark.x - width / 2) * unit,
            y: (height / 2 - pair.mark.y) * unit,
            radius: pair.mark.radius * unit,
          },
          ...(pair.glow === undefined ? {} : { glow: pair.glow }),
          ...(pair.core === undefined ? {} : { core: pair.core }),
        }
      : null,
    card: card
      ? {
          weight: card.weight,
          box: toWorldBox(card.box, width, height),
          radius: card.radius * unit,
          step: card.step,
        }
      : null,
    tubes: tubes
      ? {
          weight: tubes.weight,
          tubes: tubes.tubes.map((tube) =>
            tube ? { box: toWorldBox(tube.box, width, height), level: tube.level } : null,
          ),
        }
      : null,
    pact:
      pact && pactBox
        ? { weight: pact.weight, x: pactBox.x, y: pactBox.y, radius: Math.min(pactBox.hw, pactBox.hh) * 0.96 }
        : null,
    rivers: rivers ? { weight: rivers.weight, box: toWorldBox(rivers.box, width, height) } : null,
    flight: flight
      ? {
          progress: flight.progress,
          box: toWorldBox(flight.box, width, height),
          hero: {
            top: (height / 2 - flight.hero.top) * unit,
            height: flight.hero.height * unit,
            left: (flight.hero.left - width / 2) * unit,
            right: (flight.hero.left + flight.hero.width - width / 2) * unit,
          },
          mark: {
            x: (flight.mark.x - width / 2) * unit,
            y: (height / 2 - flight.mark.y) * unit,
            radius: flight.mark.radius * unit,
          },
        }
      : null,
  };
}

/** Below this progress the plan is at rest: the page paints it, the field does not draw it. */
export const FLIGHT_START = 0.001;
/**
 * The plan flows into the mark from the bottom up, at the pace of the rivers'
 * particles: a dot leaves when the flight's progress reaches FLIGHT_RISE
 * times its height in the hero (0 at its foot, 1 at its top), give or take
 * half of FLIGHT_JITTER, and lands with the rivers' particles, somewhere from
 * FLIGHT_LANDING to the end: the plan stays on its way as long as they do.
 */
export const FLIGHT_RISE = 0.4;
export const FLIGHT_JITTER = 0.1;
export const FLIGHT_LANDING = 0.85;
/**
 * Each dot heads for the side of the mark it comes from, give or take
 * FLIGHT_SCATTER radians (in the orbit's plane): the plan flows in streams.
 * Its curve bows upwards by FLIGHT_LIFT radii of the mark, half to one and a
 * half times that, and sideways by up to half of FLIGHT_BOW of its way.
 */
export const FLIGHT_SCATTER = 0.4;
export const FLIGHT_LIFT = 0.5;
export const FLIGHT_BOW = 0.3;
/**
 * Share of the dots that land in the mark's nucleus, taking on its colour;
 * the others land on its orbit, a little either side of it.
 */
export const FLIGHT_NUCLEUS = 0.25;
export const FLIGHT_ORBIT_WIDTH = 0.08;
/** How long before it lands (in the flight's progress) a dot merges into the mark, where the mark's particles take over. */
export const FLIGHT_MERGE = 0.12;
/** Share of the hero's height over which the plan fades out at its foot, as its canvas does (marketing.css). */
export const FLIGHT_FOOT = 0.28;

/** How many random numbers each dot of the plan draws for its flight (`flightRandom` channels). */
export const FLIGHT_CHANNELS = 8;

/**
 * The `channel`-th random number in [0, 1) of the plan's dot `index`: the
 * PCG hash the ion field's shader uses (three's TSL `hash`), so both draw
 * the same flight for each dot, with no pattern between dots or channels.
 */
export function flightRandom(index: number, channel: number): number {
  const seed = (index * FLIGHT_CHANNELS + channel) >>> 0;
  const state = (Math.imul(seed, 747_796_405) + 2_891_336_453) >>> 0;
  const word = Math.imul(((state >>> ((state >>> 28) + 4)) ^ state) >>> 0, 277_803_737) >>> 0;
  return (((word >>> 22) ^ word) >>> 0) / 2 ** 32;
}

/**
 * Where a dot of the plan stands at the flight's progress, starting from
 * `start` (world units), how much of its light it keeps, and how much it has
 * taken on the colour of the mark's nucleus (`plasma`). Each dot is a
 * particle of its own, from its `index` in the plan: it leaves its street when
 * the flow rising from the foot of the hero reaches it, and flies, along a
 * curve bowed upwards, to the side of the mark it comes from, on the orbit or
 * in the nucleus, where it merges into the mark's particles: the plan flows
 * into the mark in streams, each dot a little off its neighbours. Dots the
 * plan's canvas does not show at rest (outside the hero, or past its foot)
 * stay unseen. The ion field's shader computes the same (scene.ts).
 */
export function flightPoint(
  start: { readonly x: number; readonly y: number },
  index: number,
  flight: FlightFormation,
  out: { x: number; y: number; light: number; plasma: number },
): void {
  const random = (channel: number) => flightRandom(index, channel);
  const { mark, hero } = flight;
  const radius = Math.max(mark.radius, 1e-6);
  // When it leaves, and when it lands.
  const fromFoot = Math.min(1, Math.max(0, (start.y - (hero.top - hero.height)) / hero.height));
  const leave = Math.max(0, FLIGHT_RISE * fromFoot + FLIGHT_JITTER * (random(0) - 0.5));
  const land = FLIGHT_LANDING + (1 - FLIGHT_LANDING) * random(1);
  const p = smoothstep(leave, land, flight.progress);
  // Where it lands: the side of the mark it comes from (seen in the orbit's plane), give or take.
  const cos = Math.cos(MARK.tilt);
  const sin = Math.sin(MARK.tilt);
  const dx = start.x - mark.x;
  const dy = start.y - mark.y;
  let u = dx * cos + dy * sin;
  let v = (dy * cos - dx * sin) / MARK.orbitMinor;
  const away = Math.hypot(u, v);
  if (away > 1e-9) {
    u /= away;
    v /= away;
  } else {
    u = 1;
    v = 0;
  }
  const scatter = (random(2) - 0.5) * 2 * FLIGHT_SCATTER;
  const su = u * Math.cos(scatter) - v * Math.sin(scatter);
  const sv = u * Math.sin(scatter) + v * Math.cos(scatter);
  const nucleus = random(3) < FLIGHT_NUCLEUS;
  // On the orbit: the circle of the orbit's plane, flattened and tilted into the ring. In the
  // nucleus: a disc.
  const reach = nucleus
    ? radius * NUCLEUS_REACH * Math.sqrt(random(4))
    : radius * (1 + (random(4) - 0.5) * FLIGHT_ORBIT_WIDTH);
  const flat = nucleus ? 1 : MARK.orbitMinor;
  const tx = mark.x + (su * cos - sv * flat * sin) * reach;
  const ty = mark.y + (su * sin + sv * flat * cos) * reach;
  // How it gets there: a quadratic Bézier, its middle lifted and pushed aside a little.
  const aside = (random(5) - 0.5) * FLIGHT_BOW;
  const cx = (start.x + tx) / 2 - (ty - start.y) * aside;
  const cy = (start.y + ty) / 2 + (tx - start.x) * aside + FLIGHT_LIFT * radius * (0.5 + random(6));
  const q = 1 - p;
  out.x = q * q * start.x + 2 * q * p * cx + p * p * tx;
  out.y = q * q * start.y + 2 * q * p * cy + p * p * ty;
  const shown =
    start.x >= hero.left && start.x <= hero.right && start.y <= hero.top
      ? Math.min(1, Math.max(0, (1 - (hero.top - start.y) / hero.height) / FLIGHT_FOOT))
      : 0;
  out.light = shown * (1 - smoothstep(land - FLIGHT_MERGE, land, flight.progress));
  out.plasma = nucleus ? smoothstep(0.4, 1, p) : 0;
}
