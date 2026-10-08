import { MARK } from "./layout";

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
}

/** One of the hero's two profile cards, as the page draws it: world units, radians counterclockwise. */
export interface ProfileCardShape {
  readonly x: number;
  readonly y: number;
  readonly hw: number;
  readonly hh: number;
  readonly angle: number;
  /** The person's school, in `SCHOOL_KEYS` order: atoms of that school colour the picture. */
  readonly school: number;
}

/**
 * The hero's two profile cards, made of atoms: each pair of particles holds a
 * point of one card (its outline, its picture, the orbit drawn on it, the
 * lines of its text) right behind the card, so nothing shows while the card
 * is there; `glow` lights them (the landing keeps them unlit) and `spread`
 * blows them away in a soft cloud around the cards. Scrolling hands them over
 * to the logo mark, from the top of the cards down.
 */
export interface ProfilesFormation {
  readonly weight: number;
  readonly cards: readonly [ProfileCardShape, ProfileCardShape];
  /** 0: the atoms make up the cards; 1: blown away around them. */
  readonly spread: number;
  /** Light of the atoms, in [0, 1]. */
  readonly glow: number;
}

export interface Formations {
  /** Light of the particles no formation holds, in [0, 1] (default 1): the hero's drifting dust is dim. */
  readonly freeGlow?: number;
  /** Tint of the free particles towards paper white, in [0, 1] (default 0: their school colour). */
  readonly freePaper?: number;
  readonly profiles?: ProfilesFormation | null;
  readonly pair?: PairFormation | null;
  readonly card?: CardFormation | null;
  readonly tubes?: TubeFormation | null;
  readonly pact?: PactFormation | null;
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
const NUCLEUS_REACH = 0.26;
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
  readonly profiles?: { readonly weight: number } | null;
  readonly pair?: { readonly weight: number } | null;
  readonly card?: { readonly weight: number } | null;
  readonly tubes?: { readonly weight: number } | null;
  readonly pact?: { readonly weight: number } | null;
}): number {
  return Math.max(
    formations.profiles?.weight ?? 0,
    formations.pair?.weight ?? 0,
    formations.card?.weight ?? 0,
    formations.tubes?.weight ?? 0,
    formations.pact?.weight ?? 0,
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
  /** Size of the particle's light (1: its own); the hero's profile cards set it, finer. */
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
  // Smallest positive root of a r² - 2 d r + c, in its stable form.
  const apart = c / (d + Math.sqrt(Math.max(0, d * d - a * c)));
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
  // The stage moves with the page; once merged, the mark stays put in the viewport.
  into.carry = previous ? (pair.box.y - previous.box.y) * (1 - merged) : 0;

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
    into.glow = 0.5 + 0.8 * (1 - depth);
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

/** Shares of a profile card's pairs: outline, picture and the orbit drawn on it; the rest draw its text. */
const PROFILE_OUTLINE = 0.3;
const PROFILE_PICTURE = 0.76;
const PROFILE_ORBIT = 0.86;
/** The atoms stay this far inside a card's edge (CSS pixels), hidden even while it moves. */
const PROFILE_INSET = 7;
/** Text lines of a card under its picture: where (0 top of the text, 1 bottom) and how long (share of the width). */
const PROFILE_LINES = [
  [0.18, 0.42],
  [0.38, 0.5],
  [0.62, 0.86],
  [0.8, 0.58],
] as const;

/**
 * Where a particle stands on its profile card: its target before the spread,
 * its region and how far down the card it sits (0 at the top, for the order
 * in which the atoms leave the cards for the mark).
 */
const profileSpot = { x: 0, y: 0, region: 0, depth: 0 };
const local = { x: 0, y: 0 };

/** The card a particle belongs to: pairs go to either card in turn. */
const cardOf = (cards: ProfilesFormation["cards"], index: number) => ((index >> 1) & 1 ? cards[1] : cards[0]);

/**
 * The point of a profile card a particle holds (`profileSpot`): pairs go to
 * either card in turn, then to a region by their random phase; the two atoms
 * of a pair sit a hair apart. Positions are worked out on the card standing
 * straight, then turned with it.
 */
function locateOnProfile(
  particles: FormationParticles,
  index: number,
  profiles: ProfilesFormation,
  unit: number,
): void {
  const base = index & ~1;
  const card = cardOf(profiles.cards, index);
  const phase = particles.phases[base] ?? 0;
  // A low-discrepancy pair of coordinates, nudged at random: evenly filled, without the
  // diagonal rows the bare sequence would draw.
  const s = clamp01((particles.along[base] ?? 0) + (fract(phase * 91.7) - 0.5) * 0.05);
  const t = clamp01((particles.lanes[base] ?? 0) + (fract(phase * 53.3) - 0.5) * 0.05);
  const inset = PROFILE_INSET * unit;
  const hw = Math.max(card.hw - inset, unit);
  const hh = Math.max(card.hh - inset, unit);
  // The picture is a little taller than wide (4 / 4.2), at the top; the text fills the rest.
  const pictureBottom = Math.max(-hh * 0.5, card.hh - 2 * card.hw * 1.05);
  if (phase < PROFILE_OUTLINE) {
    contourPoint({ x: 0, y: 0, hw, hh }, Math.min(hw, hh) * 0.12, 0, s, local);
    profileSpot.region = 0;
  } else if (phase < PROFILE_PICTURE) {
    local.x = (s * 2 - 1) * hw;
    local.y = hh - t * (hh - pictureBottom);
    profileSpot.region = 1;
  } else if (phase < PROFILE_ORBIT) {
    // The orbit drawn on the picture: a tilted ellipse around its middle.
    const angle = s * TAU;
    const rx = 0.39 * 2 * card.hw;
    const ry = 0.148 * 2 * card.hw;
    const cx = 0;
    const cy = card.hh - (card.hh - pictureBottom) * 0.46;
    const ex = Math.cos(angle) * rx;
    const ey = Math.sin(angle) * ry;
    const tilt = (24 * Math.PI) / 180;
    local.x = cx + ex * Math.cos(tilt) - ey * Math.sin(tilt);
    local.y = cy + ex * Math.sin(tilt) + ey * Math.cos(tilt);
    profileSpot.region = 2;
  } else {
    const line = PROFILE_LINES[Math.min(PROFILE_LINES.length - 1, Math.floor(t * PROFILE_LINES.length))] ?? [
      0.5, 0.5,
    ];
    const textTop = pictureBottom - inset;
    local.x = -hw + s * line[1] * 2 * hw;
    local.y = textTop - line[0] * (textTop + hh);
    profileSpot.region = 3;
  }
  // The two atoms of a pair, a hair apart: one grain of dust.
  const side = (index & 1) === 0 ? 1 : -1;
  local.x += side * Math.cos(phase * 40) * 0.6 * unit;
  local.y += side * Math.sin(phase * 40) * 0.6 * unit;
  profileSpot.depth = clamp01((card.hh - local.y) / (2 * card.hh));
  const cos = Math.cos(card.angle);
  const sin = Math.sin(card.angle);
  profileSpot.x = card.x + local.x * cos - local.y * sin;
  profileSpot.y = card.y + local.x * sin + local.y * cos;
}

/**
 * Profiles: each particle on its point of a card (`locateOnProfile`, called
 * first). Spreading, the atoms drift out from between the two cards and
 * curl around them, rising a little, like dust blown off.
 */
function profilesContribution(
  particles: FormationParticles,
  index: number,
  profiles: ProfilesFormation,
  previous: ProfilesFormation | null,
  time: number,
  unit: number,
  into: Contribution,
): boolean {
  // The pair moves as one: both atoms take the pair's phase, so they never pull apart.
  const own = particles.phases[index & ~1] ?? 0;
  const card = cardOf(profiles.cards, index);
  let x = profileSpot.x + Math.sin(time * 1.9 + own * 31) * 0.5 * unit;
  let y = profileSpot.y + Math.cos(time * 1.6 + own * 17) * 0.5 * unit;
  const spread = profiles.spread;
  if (spread > 0) {
    const [a, b] = profiles.cards;
    const cx = (a.x + b.x) / 2;
    const cy = (a.y + b.y) / 2;
    const dx = x - cx;
    const dy = y - cy;
    const distance = Math.hypot(dx, dy) || unit;
    const swirl = spread * (0.35 + 0.5 * fract(own * 13.7));
    const reach = spread * (70 + 110 * fract(own * 29.3)) * unit;
    x = cx + dx * Math.cos(swirl) - dy * Math.sin(swirl) + (dx / distance) * reach;
    y = cy + dx * Math.sin(swirl) + dy * Math.cos(swirl) + (dy / distance) * reach + spread * 50 * unit;
  }
  into.x = x;
  into.y = y;
  const region = profileSpot.region;
  const glow = region === 0 ? 0.8 : region === 1 ? 0.9 : region === 2 ? 0.75 : 0.55;
  into.glow = glow * profiles.glow;
  into.grain = region === 1 ? 0.55 : 0.48;
  into.volt = 0;
  into.plasma = 0;
  into.paper = 0;
  if (region === 1) {
    // The picture: atoms of the person's school in their own colour, the others plasma.
    if ((particles.schools[index] ?? -1) !== card.school) {
      into.plasma = 0.85;
    }
  } else {
    into.paper = region === 2 ? 0.7 : 0.85;
  }
  into.pull = 1;
  const before = previous ? cardOf(previous.cards, index) : null;
  into.carry = before ? card.y - before.y : 0;
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
  const profiles = formations.profiles && formations.profiles.weight > 0.001 ? formations.profiles : null;
  const pair = formations.pair && formations.pair.weight > 0.001 ? formations.pair : null;
  const card = formations.card && formations.card.weight > 0.001 ? formations.card : null;
  const tubes = formations.tubes && formations.tubes.weight > 0.001 ? formations.tubes : null;
  const pact = formations.pact && formations.pact.weight > 0.001 ? formations.pact : null;
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
    let profilesWeight = profiles?.weight ?? 0;
    let pairWeight = pair?.weight ?? 0;
    if (profiles) {
      locateOnProfile(particles, index, profiles, unit);
      if (pair) {
        // The atoms leave the cards for the logo mark from the top down: each pair switches
        // over at its own moment rather than the whole cards squashing.
        const both = profiles.weight + pair.weight;
        const order = 0.75 * profileSpot.depth + 0.25 * fract((particles.phases[index & ~1] ?? 0) * 7.31);
        const gone = smoothstep(order * 0.72, order * 0.72 + 0.28, pair.weight / both);
        profilesWeight = both * (1 - gone);
        pairWeight = both * gone;
      }
    }
    if (
      profiles &&
      profilesWeight > 0 &&
      profilesContribution(particles, index, profiles, previous?.profiles ?? null, time, unit, contribution)
    ) {
      accumulate(profilesWeight);
    }
    if (
      pair &&
      geometry &&
      pairWeight > 0 &&
      pairContribution(particles, index, pair, geometry, previous?.pair ?? null, time, contribution)
    ) {
      accumulate(pairWeight);
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

/** A profile card as the page measures it: centre and size in CSS pixels, CSS rotation in degrees (clockwise). */
export interface ViewportProfileCard {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly rotation: number;
  readonly school: number;
}

/** Formations as the page measures them: viewport rectangles in CSS pixels. */
export interface ViewportFormations {
  /** Light of the particles no formation holds, in [0, 1] (default 1), and their tint towards paper white (default 0). */
  readonly freeGlow?: number;
  readonly freePaper?: number;
  /** The hero's two profile cards (see `ProfilesFormation`): centre and size in pixels, tilt in degrees. */
  readonly profiles?: {
    readonly weight: number;
    readonly cards: readonly [ViewportProfileCard, ViewportProfileCard];
    readonly spread: number;
    readonly glow: number;
  } | null;
  /** The two atoms of the logo mark (centre and radius in pixels), in a stage where they first stand apart. */
  readonly pair?: {
    readonly weight: number;
    readonly box: PixelBox;
    readonly bond: number;
    readonly merge: number;
    readonly mark: { readonly x: number; readonly y: number; readonly radius: number };
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
}

/** Converts measured formations to world units for a canvas of `width` × `height` CSS pixels. */
export function toWorldFormations(formations: ViewportFormations, width: number, height: number): Formations {
  const unit = 2 / height;
  const { profiles, pair, card, tubes, pact } = formations;
  const toWorldCard = (shape: ViewportProfileCard): ProfileCardShape => ({
    x: (shape.x - width / 2) * unit,
    y: (height / 2 - shape.y) * unit,
    hw: (shape.width / 2) * unit,
    hh: (shape.height / 2) * unit,
    // A clockwise turn on the page is a clockwise turn in the world too, whose y points up.
    angle: (-shape.rotation * Math.PI) / 180,
    school: shape.school,
  });
  const pactBox = pact ? toWorldBox(pact.box, width, height) : null;
  return {
    ...(formations.freeGlow === undefined ? {} : { freeGlow: formations.freeGlow }),
    ...(formations.freePaper === undefined ? {} : { freePaper: formations.freePaper }),
    profiles: profiles
      ? {
          weight: profiles.weight,
          cards: [toWorldCard(profiles.cards[0]), toWorldCard(profiles.cards[1])],
          spread: profiles.spread,
          glow: profiles.glow,
        }
      : null,
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
  };
}
