import { MARK } from "./layout";
import { logoEdgePoint, logoFillPoint, schoolLogoShape } from "./logos";
import { RHONE_PATH, RIVER_MAP, type RiverPath, riverPoint, SAONE_PATH } from "./rivers";

/**
 * Formations of the ion field down the landing page (docs/02-design.md):
 * where each particle heads, how strongly it is pulled there, and how it
 * glows, while the stacked cards of "how it works", the test tubes of the
 * school race, the schools' logos beside the waiting list and the rings of
 * the Pact go by.
 *
 * Pure functions over the layout (but for when the plan of Lyon's particles
 * landed, which writeFormations keeps), run on the CPU every frame and
 * handed to either backend (GPU storage buffers or instanced attributes): no
 * three.js here, and the same result whatever the renderer.
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

/**
 * The school logo stage beside the waiting list: the particles draw the logo
 * of the school it shows (`school`, an index into `SCHOOL_KEYS`), fitted in a
 * square of half side `size` round (x, y) (logos.ts), nearly half of them
 * along its edges and the others filling its ink, each in its place, in one
 * colour as the logo is. With no school shown (-1), they orbit the stage on
 * the logo mark's tilted orbit.
 */
export interface LogoFormation {
  readonly weight: number;
  readonly x: number;
  readonly y: number;
  readonly size: number;
  readonly school: number;
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
 * The dots of the plan of Lyon (the rivers hero, city.ts), taken over by
 * the field as the page scrolls and flown into the logo mark: `progress` 0
 * keeps them on the map (`box`, fitted as for the rivers), 1 has them all
 * landed in `mark`, fused into particles the field keeps for them
 * (FlightParticles), which then hold there with the mark's share of the
 * particles (`presence`, in [0, 1]) and go on with the others. Only those
 * the plan's own canvas shows fly, within the hero (`hero`: its top, height
 * and sides), fading out towards its foot as there. The field draws the
 * dots on their own until they land (scene.ts, `flightPoint`).
 */
export interface FlightFormation {
  readonly progress: number;
  readonly presence: number;
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
  readonly logo?: LogoFormation | null;
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
  /** The particles the field keeps for the plan of Lyon's flight, if any: its first ones. */
  readonly flight?: FlightParticles;
  /**
   * How many of the field's own particles (after those kept for the plan) the
   * shapes past the hero light (cards, tubes, Pact rings), when the hero
   * needs more than they do (the rivers): as many as the landing has, laid
   * out as there, so the shapes look as they do on the landing; the others
   * fuse into them on the way (`shapeHost`). All of them when unset.
   */
  readonly shapes?: number;
}

/**
 * The particle the particle `index` fuses into in the shapes past the hero
 * (FormationParticles.shapes): itself if it is one they light; otherwise one
 * of those, the partners of a pair into the partners of another. It goes
 * where its host goes there, unlit.
 */
export function shapeHost(particles: FormationParticles, index: number): number {
  const { shapes } = particles;
  if (shapes === undefined) {
    return index;
  }
  const lit = Math.floor(shapes / 2) * 2;
  const ahead = particles.flight ? Math.min(particles.flight.count, particles.count) : 0;
  const own = index - ahead;
  if (lit < 2 || (own >= 0 && own < lit)) {
    return index;
  }
  return ahead + ((own >= 0 ? own : index) % lit);
}

/**
 * The particles the field keeps for the plan's flight: its first `count`.
 * For each, the patch of streets it lands for (`gatherFlight`), in
 * FLIGHT_PATCH_STRIDE floats: where its dots come from (x and y, kilometres
 * on the map: their centre of light), its light in [0, 1] (0: no patch, the
 * particle stays unseen) and 1 if it lands in the mark's nucleus. `reveal`,
 * in [0, 1], dims them all: the field raises it once it has the plan.
 * `landed` holds, for each, when its patch landed (seconds, the formations'
 * clock), -1 until it does: writeFormations keeps it, for the particle to
 * spread along the mark from then on.
 */
export interface FlightParticles {
  readonly count: number;
  readonly patches: Float32Array;
  readonly reveal: number;
  readonly landed: Float32Array;
}

export const FLIGHT_PATCH_STRIDE = 4;

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
/** The logo's tilt, its cosine and sine. */
const TILT_COS = Math.cos(MARK.tilt);
const TILT_SIN = Math.sin(MARK.tilt);
const fract = (value: number) => value - Math.floor(value);
const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const smoothstep = (edge0: number, edge1: number, value: number) => {
  const t = clamp01((value - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
};
/** As smoothstep, setting off and arriving more gently still (and as steady in its middle). */
const smootherstep = (edge0: number, edge1: number, value: number) => {
  const t = clamp01((value - edge0) / (edge1 - edge0));
  return t * t * t * (t * (t * 6 - 15) + 10);
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
  readonly logo?: { readonly weight: number } | null;
  readonly pact?: { readonly weight: number } | null;
  readonly rivers?: { readonly weight: number } | null;
}): number {
  return Math.max(
    formations.pair?.weight ?? 0,
    formations.card?.weight ?? 0,
    formations.tubes?.weight ?? 0,
    formations.logo?.weight ?? 0,
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

/**
 * Share of the logo's particles along its edges, picked by their index: a
 * crisp outline, fine lines (ISG's statue) included; the others fill its ink.
 */
export const LOGO_EDGE = 0.45;
const GOLDEN_FRACTION = (Math.sqrt(5) - 1) / 2;
/** Light of the logo's particles, along its edges and in its ink: the edges a little brighter. */
export const LOGO_EDGE_GLOW = 1.3;
export const LOGO_GLOW = 0.55;
/** The logo in one colour, as the schools draw it in one: paper white, a hint of each atom's own. */
export const LOGO_PAPER = 0.9;
/**
 * Size of the light of the logo's particles: finer than elsewhere, so that
 * their halos do not fill the letters cut out of a logo (EPITA's), and fine
 * enough that the field draws no bonds between them (scene.ts). The bigger
 * particles (layout.ts) are drawn no bigger than LOGO_DOT: even dots.
 */
export const LOGO_GRAIN = 0.6;
export const LOGO_DOT = 0.0065;
/**
 * How far a particle of the logo wanders round its place, in the logo's
 * units (its longer side is 100): atoms, not ink. Enough to break the even
 * pattern of the fill, less along the edges, which stay crisp.
 */
const LOGO_WANDER = 0.45;
const LOGO_EDGE_WANDER = 0.25;
/** With no school shown: radius of the orbit round the stage, in half sides of its square, and its width (± a fraction). */
export const LOGO_ORBIT = 1.35;
const LOGO_ORBIT_WIDTH = 0.06;
export const LOGO_ORBIT_GLOW = 0.25;
/** How fast the particles turn round the empty stage, in turns per second. */
const LOGO_SPIN = 0.025;

/**
 * School logo: every particle in its place in the logo shown, on its edges
 * (one in two across its rows, the others down its columns) or in its ink
 * (logos.ts), from its formation coordinates: going down the logo with
 * `lanes`, across it with `along`, it holds about the same part of every
 * logo, and a new logo takes the place of the last with each atom moving a
 * short way. With no school, all of them orbit the stage.
 */
function logoContribution(
  particles: FormationParticles,
  index: number,
  logo: LogoFormation,
  previous: LogoFormation | null,
  time: number,
  into: Contribution,
): boolean {
  into.pull = 1;
  into.volt = 0;
  into.plasma = 0;
  into.carry = previous ? logo.y - previous.y : 0;
  const shape = schoolLogoShape(logo.school);
  const along = particles.along[index] ?? 0;
  const lanes = particles.lanes[index] ?? 0.5;
  if (shape) {
    const edge = fract(index * GOLDEN_FRACTION) < LOGO_EDGE;
    if (edge) {
      logoEdgePoint(shape, lanes, along, (index & 1) === 1, point);
    } else {
      logoFillPoint(shape, lanes, along, point);
    }
    const phase = (particles.phases[index] ?? 0) * TAU;
    const wander = edge ? LOGO_EDGE_WANDER : LOGO_WANDER;
    const scale = (2 * logo.size) / Math.max(shape.width, shape.height);
    into.x = logo.x + (point.x - shape.width / 2 + wander * Math.cos(time * 1.7 + phase)) * scale;
    into.y = logo.y - (point.y - shape.height / 2 + wander * Math.sin(time * 1.3 + phase)) * scale;
    into.glow = edge ? LOGO_EDGE_GLOW : LOGO_GLOW;
    into.paper = LOGO_PAPER;
    into.grain = LOGO_GRAIN * Math.min(1, LOGO_DOT / (particles.sizes[index] || LOGO_DOT));
    return true;
  }
  const theta = (along + time * LOGO_SPIN) * TAU;
  const radius = logo.size * LOGO_ORBIT * (1 + (lanes * 2 - 1) * LOGO_ORBIT_WIDTH);
  orbitPoint(logo, radius, MARK.tilt, theta, point);
  into.x = point.x;
  into.y = point.y;
  into.glow = LOGO_ORBIT_GLOW;
  into.paper = 0;
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
  map: { readonly scale: number; readonly x: number; readonly y: number },
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

/** Fraction of the orbit's arc length, in [0, 1), at the angle `theta`: the inverse of orbitTheta. */
export function orbitArc(theta: number): number {
  const angle = ((theta % TAU) + TAU) % TAU;
  let low = 0;
  let high = ORBIT_SAMPLES;
  while (high - low > 1) {
    const middle = (low + high) >> 1;
    if ((ORBIT_THETA[middle] ?? 0) <= angle) {
      low = middle;
    } else {
      high = middle;
    }
  }
  const from = ORBIT_THETA[low] ?? 0;
  const to = ORBIT_THETA[low + 1] ?? TAU;
  return fract((low + (to > from ? (angle - from) / (to - from) : 0)) / ORBIT_SAMPLES);
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
function accumulate(weight: number, unlit = false): void {
  // A target that is not a number would lose the particle for good: such a contribution is left out.
  if (!Number.isFinite(contribution.x) || !Number.isFinite(contribution.y)) {
    contribution.grain = 1;
    return;
  }
  const w = weight * contribution.pull;
  sum.x += contribution.x * w;
  sum.y += contribution.y * w;
  sum.glow += unlit ? 0 : contribution.glow * w;
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
 * The particles kept for the plan of Lyon (`particles.flight`) stand in the
 * mark for their patch of streets instead of the rivers' and the mark's
 * other places, unseen until their patch lands, and take part in the other
 * shapes as every particle does.
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
  const logo = formations.logo && formations.logo.weight > 0.001 ? formations.logo : null;
  const pact = formations.pact && formations.pact.weight > 0.001 ? formations.pact : null;
  const rivers = formations.rivers && formations.rivers.weight > 0.001 ? formations.rivers : null;
  const flight = formations.flight ?? null;
  const freeGlow = formations.freeGlow ?? 1;
  const freePaper = formations.freePaper ?? 0;
  const kept = particles.flight;
  const keptCount = kept ? Math.min(kept.count, particles.count) : 0;

  // Where the two atoms stand this frame, and where the map lies: the same for every particle.
  const geometry = pair ? pairGeometry(pair, time) : null;
  const riverMap = rivers ? riverMapTransform(rivers.box) : null;
  const flightMap = flight ? riverMapTransform(flight.box) : null;

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
    // The plan's particles stand in the mark for their patch of streets, in the rivers' stead:
    // unseen until it fuses into them, then spreading round the mark from when it landed.
    const planned = index < keptCount;
    // Past the hero, the particles a hero with more needed fuse into those the shapes light.
    const host = shapeHost(particles, index);
    const fuses = host !== index;
    let fusion = 0;
    if (kept && planned) {
      fusion = plannedFusion(index, flight);
      const { landed } = kept;
      if (fusion <= 0) {
        landed[index] = -1;
      } else if ((landed[index] ?? -1) < 0) {
        landed[index] = time;
      }
      const spread = fusion * smoothstep(0, FLIGHT_SPREAD, time - (landed[index] ?? time));
      if (
        flight &&
        flightMap &&
        landingContribution(
          particles,
          index,
          flight,
          flightMap,
          previous?.flight ?? null,
          time,
          spread,
          contribution,
        )
      ) {
        accumulate(flight.presence);
      }
    } else if (
      pair &&
      geometry &&
      pairContribution(particles, index, pair, geometry, previous?.pair ?? null, time, contribution)
    ) {
      contribution.glow *= pair.glow ?? 1;
      accumulate(pair.weight);
    }
    if (card && cardContribution(particles, host, card, previous?.card ?? null, time, unit, contribution)) {
      accumulate(card.weight, fuses);
    }
    if (tubes && tubeContribution(particles, host, tubes, previous?.tubes ?? null, time, contribution)) {
      accumulate(tubes.weight, fuses);
    }
    if (logo && logoContribution(particles, host, logo, previous?.logo ?? null, time, contribution)) {
      accumulate(logo.weight, fuses);
    }
    if (pact && pactContribution(particles, host, pact, previous?.pact ?? null, time, contribution)) {
      accumulate(pact.weight, fuses);
    }
    if (
      !planned &&
      rivers &&
      riverMap &&
      riversContribution(particles, index, rivers, riverMap, previous?.rivers ?? null, time, contribution)
    ) {
      accumulate(rivers.weight);
    }
    const { x, y, total, glow, volt, plasma, paper, carry, grain } = sum;
    // Unseen until their patch lands, then particles like the others.
    const seen =
      kept && planned ? (kept.patches[index * FLIGHT_PATCH_STRIDE + 2] ?? 0) * fusion * kept.reveal : 1;

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
      looks[offset + 2] = (freeGlow + (glow / total - freeGlow) * share) * seen;
      looks[offset + 3] = freePaper + (paper / total - freePaper) * share;
      if (grains) {
        grains[index] = 1 + (grain / total - 1) * share;
      }
    } else {
      targets[offset + 2] = 0;
      targets[offset + 3] = 0;
      looks[offset] = 0;
      looks[offset + 1] = 0;
      looks[offset + 2] = freeGlow * seen;
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
  /** The school logo stage: the logo is drawn in the largest square of its box. */
  readonly logo?: { readonly weight: number; readonly box: PixelBox; readonly school: number } | null;
  /** The Pact stage: the rings are inscribed in it. */
  readonly pact?: { readonly weight: number; readonly box: PixelBox } | null;
  /** The map of the rivers (rivers.ts), fitted whole in its box. */
  readonly rivers?: { readonly weight: number; readonly box: PixelBox } | null;
  /** The plan's dots flying into the logo mark (FlightFormation): the map, the hero, the mark in pixels. */
  readonly flight?: {
    readonly progress: number;
    readonly presence: number;
    readonly box: PixelBox;
    readonly hero: PixelBox;
    readonly mark: { readonly x: number; readonly y: number; readonly radius: number };
  } | null;
}

/** Converts measured formations to world units for a canvas of `width` × `height` CSS pixels. */
export function toWorldFormations(formations: ViewportFormations, width: number, height: number): Formations {
  const unit = 2 / height;
  const { pair, card, tubes, logo, pact, rivers, flight } = formations;
  const logoBox = logo ? toWorldBox(logo.box, width, height) : null;
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
    logo:
      logo && logoBox
        ? {
            weight: logo.weight,
            x: logoBox.x,
            y: logoBox.y,
            size: Math.min(logoBox.hw, logoBox.hh),
            school: logo.school,
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
          presence: flight.presence,
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
 * The flight follows the page's scroll with the inertia of the field's
 * particles following their shapes: its progress glides after the scroll's
 * (`followFlight`), a critically damped spring of FLIGHT_FOLLOW radians a
 * second, so the plan moves as smoothly as the rivers, whatever the wheel's
 * steps.
 */
export const FLIGHT_FOLLOW = 4.5;
/**
 * The plan flows into the mark from the bottom up as soon as the page
 * scrolls, with the rivers' particles, at their pace: a dot leaves when the
 * flight's progress reaches FLIGHT_DELAY (none: from the first scroll) plus
 * FLIGHT_RISE times its height in the hero (0 at its foot, 1 at its top),
 * give or take half of FLIGHT_JITTER, gently, and lands with the rivers'
 * particles, softly, somewhere from FLIGHT_LANDING to the end: the plan
 * stays on its way as long as they do.
 */
export const FLIGHT_DELAY = 0;
export const FLIGHT_RISE = 0.45;
export const FLIGHT_JITTER = 0.1;
export const FLIGHT_LANDING = 0.85;
/**
 * Each patch of streets heads for the side of the mark it comes from, give or
 * take FLIGHT_SCATTER radians (in the orbit's plane): the plan flows in
 * streams. Each dot's curve bows upwards by FLIGHT_LIFT radii of the mark,
 * half to one and a half times that, and sideways by up to half of FLIGHT_BOW
 * of its way.
 */
export const FLIGHT_SCATTER = 1;
export const FLIGHT_LIFT = 0.5;
export const FLIGHT_BOW = 0.3;
/**
 * Share of the patches that land in the mark's nucleus, taking on its colour,
 * besides those of the heavy particles (which sit in the nucleus, as in the
 * mark); the others land on its orbit, a little either side of it.
 */
export const FLIGHT_NUCLEUS = 0.25;
export const FLIGHT_ORBIT_WIDTH = 0.08;
/**
 * The field keeps FLIGHT_SHARE more particles for the plan (the ion field's
 * `flight` option), ahead of its own, and gathers the plan the hero shows
 * into as many patches of streets at most (`gatherFlight`), each landing as
 * one of them: over the last FLIGHT_MERGE of the flight's progress before its
 * patch lands, the patch's dots fuse into its particle, which lights up as
 * they fade. Unseen until then, it is a particle like the others from then
 * on. A patch lights its particle fully from FLIGHT_PATCH_LIGHT of the light
 * of the median patch, less below.
 */
export const FLIGHT_SHARE = 0.25;
export const FLIGHT_MERGE = 0.1;
export const FLIGHT_PATCH_LIGHT = 0.5;
/**
 * How fast the patches' places in the mark move with it: along the orbit, in
 * turns a second, as its dust does; round the nucleus, in radians a second.
 */
export const FLIGHT_ORBIT_SPIN = 0.04;
export const FLIGHT_NUCLEUS_SPIN = 0.1;
/**
 * Landed, the plan's particles spread along the orbit (or round the nucleus)
 * over FLIGHT_SPREAD seconds, each its own way, until they line it as evenly
 * as its own dust: the city melts into the atom.
 */
export const FLIGHT_SPREAD = 6;
/** Share of the hero's height over which the plan fades out at its foot, as its canvas does (marketing.css). */
export const FLIGHT_FOOT = 0.28;
/**
 * On their way, the plan's dots make way for the pointer as the field's
 * particles do: pushed away from it by up to FLIGHT_PUSH (world units),
 * within about FLIGHT_PUSH_REACH of it; not at rest (the page paints the
 * plan), nor as they land (their particle makes way itself).
 */
export const FLIGHT_PUSH = 0.06;
export const FLIGHT_PUSH_REACH = 0.1;

/** How many random numbers each dot of the plan, and each particle kept for it, draws for its flight (`flightRandom` channels). */
export const FLIGHT_CHANNELS = 8;

/**
 * The `channel`-th random number in [0, 1) of the plan's dot `index` (or of
 * the particle `index` kept for the plan): the PCG hash the ion field's
 * shader uses (three's TSL `hash`), so both draw the same flight for each
 * dot, with no pattern between dots or channels.
 */
export function flightRandom(index: number, channel: number): number {
  const seed = (index * FLIGHT_CHANNELS + channel) >>> 0;
  const state = (Math.imul(seed, 747_796_405) + 2_891_336_453) >>> 0;
  const word = Math.imul(((state >>> ((state >>> 28) + 4)) ^ state) >>> 0, 277_803_737) >>> 0;
  return (((word >>> 22) ^ word) >>> 0) / 2 ** 32;
}

/** Where the plan's flight stands as it follows the scroll (`followFlight`): its progress, and how fast it goes (a second). */
export interface FlightMotion {
  progress: number;
  speed: number;
}

/**
 * Moves the flight `delta` seconds on towards the progress the scroll asks
 * for (`target`), as a critically damped spring (FLIGHT_FOLLOW): it sets off
 * and arrives smoothly, never overshoots, and follows the same course
 * whatever the frame time.
 */
export function followFlight(motion: FlightMotion, target: number, delta: number): void {
  const away = motion.progress - target;
  const swing = motion.speed + FLIGHT_FOLLOW * away;
  const decay = Math.exp(-FLIGHT_FOLLOW * delta);
  motion.progress = target + (away + swing * delta) * decay;
  motion.speed = (motion.speed - FLIGHT_FOLLOW * swing * delta) * decay;
}

/** When the patch of streets of the particle `index` kept for the plan lands, in the flight's progress. */
export function flightLand(index: number): number {
  return FLIGHT_LANDING + (1 - FLIGHT_LANDING) * flightRandom(index, 1);
}

/** How much the plan's canvas shows of a dot at (x, y), world units: within the hero, fading out towards its foot. */
function shownBy(hero: FlightFormation["hero"], x: number, y: number): number {
  return x >= hero.left && x <= hero.right && y <= hero.top
    ? Math.min(1, Math.max(0, (1 - (hero.top - y) / hero.height) / FLIGHT_FOOT))
    : 0;
}

/**
 * How many of the plan's dots (or patches) gatherFlightSteps and
 * packFlightSteps go through between two pauses: few enough for the ion
 * field to spread their work over frames, a few milliseconds a frame.
 */
export const FLIGHT_GATHER_STEP = 512;

/** Whether a loop of gatherFlightSteps or packFlightSteps pauses before its `index`-th turn. */
const pausesAt = (index: number) => index > 0 && index % FLIGHT_GATHER_STEP === 0;

/** Runs steps (gatherFlightSteps, packFlightSteps) to their end, and returns what they return. */
function runSteps<T>(steps: Generator<void, T, void>): T {
  for (;;) {
    const step = steps.next();
    if (step.done) {
      return step.value;
    }
  }
}

/**
 * Gathers the dots of the plan the hero shows (`place`, kilometres on the
 * map, and `look`, their colour and opacity as painted, four floats each)
 * into square patches of streets, as small as the particles the field keeps
 * for the plan allow (`particles.flight`, one a patch), and writes each patch
 * into its particle's entry, in order of their places. Writes, for each dot,
 * the particle it lands as (-1: none, a dot the hero does not show) and 1 if
 * that one lands in the nucleus, into `dots` (two floats each). Returns the
 * side of the patches, in kilometres (0 when there are none).
 */
export function gatherFlight(
  place: Float32Array,
  look: Float32Array,
  flight: FlightFormation,
  particles: FormationParticles,
  dots: Float32Array,
): number {
  return runSteps(gatherFlightSteps(place, look, flight, particles, dots));
}

/**
 * gatherFlight a step at a time: the same work, in the same order, to the
 * same result, pausing (`yield`) every FLIGHT_GATHER_STEP dots or patches, so
 * that the ion field spreads it over frames rather than stall one (scene.ts).
 * Done, it returns what gatherFlight returns.
 */
export function* gatherFlightSteps(
  place: Float32Array,
  look: Float32Array,
  flight: FlightFormation,
  particles: FormationParticles,
  dots: Float32Array,
): Generator<void, number, void> {
  const kept = particles.flight;
  const capacity = Math.min(kept?.count ?? 0, particles.count);
  const count = Math.floor(place.length / 2);
  for (let index = 0; index < count; index += 1) {
    if (pausesAt(index)) {
      yield;
    }
    dots[index * 2] = -1;
    dots[index * 2 + 1] = 0;
  }
  kept?.patches.fill(0);
  if (!kept || capacity === 0) {
    return 0;
  }
  // Each dot's light as the hero shows it, and the extent of what it shows: the dots it shows, in order.
  const map = riverMapTransform(flight.box);
  const light = new Float32Array(count);
  const shown = new Int32Array(count);
  let shownCount = 0;
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (let index = 0; index < count; index += 1) {
    if (pausesAt(index)) {
      yield;
    }
    const x = place[index * 2] ?? 0;
    const y = place[index * 2 + 1] ?? 0;
    const seen =
      shownBy(flight.hero, map.x + x * map.scale, map.y + y * map.scale) * (look[index * 4 + 3] ?? 0);
    light[index] = seen;
    if (seen > 0) {
      shown[shownCount] = index;
      shownCount += 1;
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
  }
  if (minX > maxX) {
    return 0;
  }
  // Where each lies from the corner of what the hero shows.
  const across = new Float64Array(shownCount);
  const up = new Float64Array(shownCount);
  for (let k = 0; k < shownCount; k += 1) {
    if (pausesAt(k)) {
      yield;
    }
    const index = shown[k] ?? 0;
    across[k] = (place[index * 2] ?? 0) - minX;
    up[k] = (place[index * 2 + 1] ?? 0) - minY;
  }
  // The smallest square patches that fit: there are about as many as the area over their side
  // squared. A grid of the patches each side tries, in order of their places (column by column).
  let grid = new Int32Array(0);
  let columns = 0;
  let rows = 0;
  let stamp = 0;
  const cellOf = (k: number, side: number) =>
    Math.floor((across[k] ?? 0) / side) * rows + Math.floor((up[k] ?? 0) / side);
  function* gather(side: number): Generator<void, number, void> {
    columns = Math.floor((maxX - minX) / side) + 1;
    rows = Math.floor((maxY - minY) / side) + 1;
    if (grid.length < columns * rows) {
      grid = new Int32Array(columns * rows);
      stamp = 0;
    }
    stamp += 1;
    let found = 0;
    for (let k = 0; k < shownCount; k += 1) {
      if (pausesAt(k)) {
        yield;
      }
      const cell = cellOf(k, side);
      if (grid[cell] !== stamp) {
        grid[cell] = stamp;
        found += 1;
      }
    }
    return found;
  }
  let side = Math.max(1e-3, Math.sqrt(((maxX - minX) * (maxY - minY)) / capacity));
  side = Math.max(1e-3, side * Math.sqrt((yield* gather(side)) / capacity));
  let patches = yield* gather(side);
  while (patches > capacity) {
    side *= Math.max(1.02, Math.sqrt(patches / capacity));
    patches = yield* gather(side);
  }
  // In order of their places; each lands from its dots' centre of light.
  const slots = new Int32Array(columns * rows);
  for (let cell = 0, slot = 0; cell < columns * rows; cell += 1) {
    if (pausesAt(cell)) {
      yield;
    }
    if (grid[cell] === stamp) {
      slots[cell] = slot;
      slot += 1;
    }
  }
  const sums = new Float64Array(patches * 3);
  for (let k = 0; k < shownCount; k += 1) {
    if (pausesAt(k)) {
      yield;
    }
    const index = shown[k] ?? 0;
    const seen = light[index] ?? 0;
    const slot = slots[cellOf(k, side)] ?? 0;
    dots[index * 2] = slot;
    sums[slot * 3] = (sums[slot * 3] ?? 0) + seen * (place[index * 2] ?? 0);
    sums[slot * 3 + 1] = (sums[slot * 3 + 1] ?? 0) + seen * (place[index * 2 + 1] ?? 0);
    sums[slot * 3 + 2] = (sums[slot * 3 + 2] ?? 0) + seen;
  }
  const lights = Array.from({ length: patches }, (_, slot) => sums[slot * 3 + 2] ?? 0).sort((a, b) => a - b);
  const full = Math.max(1e-9, FLIGHT_PATCH_LIGHT * (lights[patches >> 1] ?? 0));
  const { patches: entries } = kept;
  for (let slot = 0; slot < capacity; slot += 1) {
    if (pausesAt(slot)) {
      yield;
    }
    const total = slot < patches ? (sums[slot * 3 + 2] ?? 0) : 0;
    entries[slot * FLIGHT_PATCH_STRIDE] = total > 0 ? (sums[slot * 3] ?? 0) / total : 0;
    entries[slot * FLIGHT_PATCH_STRIDE + 1] = total > 0 ? (sums[slot * 3 + 1] ?? 0) / total : 0;
    entries[slot * FLIGHT_PATCH_STRIDE + 2] = Math.min(1, total / full);
    // The heavy particles sit in the nucleus, as in the mark.
    entries[slot * FLIGHT_PATCH_STRIDE + 3] =
      (particles.sizes[slot] ?? 0) >= PAIR_HEAVY || flightRandom(slot, 3) < FLIGHT_NUCLEUS ? 1 : 0;
  }
  for (let index = 0; index < count; index += 1) {
    if (pausesAt(index)) {
      yield;
    }
    const slot = dots[index * 2] ?? -1;
    if (slot >= 0) {
      dots[index * 2 + 1] = entries[slot * FLIGHT_PATCH_STRIDE + 3] ?? 0;
    }
  }
  return side;
}

/** Floats per dot in the arrays packFlight fills (but `size`, one). */
export const FLIGHT_PACK_STRIDE = 4;

/**
 * Packs the dots the hero shows for the ion field's shader (scene.ts), in
 * their order, from the plan (`place`, `look` and `radius`, as cityFlight
 * hands them) and how gatherFlight gathered them (`landing`): for each, in
 * `route`, where it starts (x and y, kilometres on the map), the particle it
 * lands as and 1 if that one lands in the nucleus; in `timing`, when it
 * leaves and lands (in the flight's progress) and how its curve bows (aside,
 * and up in radii of the mark); in `color`, its colour and its light as the
 * hero shows it; in `size`, its radius. The others, unseen, are left out.
 * Returns how many it packed. The shader flies each by these numbers as
 * flightPoint does, with nothing to draw for the dots no one sees.
 */
export function packFlight(
  place: Float32Array,
  look: Float32Array,
  radius: Float32Array,
  landing: Float32Array,
  flight: FlightFormation,
  route: Float32Array,
  timing: Float32Array,
  color: Float32Array,
  size: Float32Array,
): number {
  return runSteps(packFlightSteps(place, look, radius, landing, flight, route, timing, color, size));
}

/**
 * packFlight a step at a time, as gatherFlightSteps gathers: the same numbers,
 * pausing every FLIGHT_GATHER_STEP dots. Done, it returns how many it packed.
 */
export function* packFlightSteps(
  place: Float32Array,
  look: Float32Array,
  radius: Float32Array,
  landing: Float32Array,
  flight: FlightFormation,
  route: Float32Array,
  timing: Float32Array,
  color: Float32Array,
  size: Float32Array,
): Generator<void, number, void> {
  const map = riverMapTransform(flight.box);
  const { hero } = flight;
  const count = Math.floor(place.length / 2);
  let packed = 0;
  for (let index = 0; index < count; index += 1) {
    if (pausesAt(index)) {
      yield;
    }
    const slot = landing[index * 2] ?? -1;
    if (slot < 0) {
      continue;
    }
    const own = (channel: number) => flightRandom(index, channel);
    const x = place[index * 2] ?? 0;
    const y = place[index * 2 + 1] ?? 0;
    const startX = map.x + x * map.scale;
    const startY = map.y + y * map.scale;
    const fromFoot = Math.min(1, Math.max(0, (startY - (hero.top - hero.height)) / hero.height));
    const at = packed * FLIGHT_PACK_STRIDE;
    route[at] = x;
    route[at + 1] = y;
    route[at + 2] = slot;
    route[at + 3] = landing[index * 2 + 1] ?? 0;
    timing[at] = Math.max(0, FLIGHT_DELAY + FLIGHT_RISE * fromFoot + FLIGHT_JITTER * (own(0) - 0.5));
    timing[at + 1] = flightLand(slot);
    timing[at + 2] = (own(5) - 0.5) * FLIGHT_BOW;
    timing[at + 3] = FLIGHT_LIFT * (0.5 + own(6));
    color[at] = look[index * 4] ?? 0;
    color[at + 1] = look[index * 4 + 1] ?? 0;
    color[at + 2] = look[index * 4 + 2] ?? 0;
    color[at + 3] = (look[index * 4 + 3] ?? 0) * shownBy(hero, startX, startY);
    size[packed] = radius[index] ?? 0;
    packed += 1;
  }
  return packed;
}

/**
 * Where the particle `index` kept for the plan stands in the mark for its
 * patch of streets, and how it shines there: on the side of the mark the
 * patch comes from (seen in the orbit's plane), give or take, on its orbit
 * or in its nucleus, lit as the mark's own particles there, moving as they
 * do; then, as `spread` goes from 0 to 1 once landed, off along the orbit
 * (or round the nucleus), its own way, until the plan's particles line it
 * evenly. Its patch's dots fly to it (flightPoint), and it stands there
 * unseen until they land (writeFormations).
 */
function landingContribution(
  particles: FormationParticles,
  index: number,
  flight: FlightFormation,
  map: { readonly scale: number; readonly x: number; readonly y: number },
  previous: FlightFormation | null,
  time: number,
  spread: number,
  into: Contribution,
): boolean {
  const entries = particles.flight?.patches;
  if (!entries) {
    return false;
  }
  const patch = (channel: number) => flightRandom(index, channel);
  const { mark } = flight;
  const radius = Math.max(mark.radius, 1e-6);
  const nucleus = (entries[index * FLIGHT_PATCH_STRIDE + 3] ?? 0) > 0.5;
  // The side of the mark the patch comes from, seen in the orbit's plane, give or take.
  const dx = map.x + (entries[index * FLIGHT_PATCH_STRIDE] ?? 0) * map.scale - mark.x;
  const dy = map.y + (entries[index * FLIGHT_PATCH_STRIDE + 1] ?? 0) * map.scale - mark.y;
  const u = dx * TILT_COS + dy * TILT_SIN;
  const v = (dy * TILT_COS - dx * TILT_SIN) / MARK.orbitMinor;
  const side = Math.hypot(u, v) > 1e-9 ? Math.atan2(v, u) : 0;
  const scatter = (patch(2) - 0.5) * 2 * FLIGHT_SCATTER;
  // Once landed, off its own way round the mark: a turn at most, either way.
  const drift = (patch(7) - 0.5) * spread;
  into.pull = 1;
  into.volt = 0;
  into.carry = previous ? mark.y - previous.mark.y : 0;
  if (nucleus) {
    // A disc, brighter at its heart, slowly swirling.
    const depth = Math.sqrt(patch(4));
    const angle = side + scatter + drift * TAU + time * FLIGHT_NUCLEUS_SPIN + MARK.tilt;
    into.x = mark.x + Math.cos(angle) * radius * NUCLEUS_REACH * depth;
    into.y = mark.y + Math.sin(angle) * radius * NUCLEUS_REACH * depth;
    into.glow = 0.5 + 0.8 * (1 - depth);
    into.plasma = 0.9;
    into.paper = 0;
    return true;
  }
  // The orbit's dust: a fine thread, its near half brighter, turning.
  const theta = orbitTheta(orbitArc(side + scatter) + drift + time * FLIGHT_ORBIT_SPIN);
  orbitPoint(mark, radius * (1 + (patch(4) - 0.5) * FLIGHT_ORBIT_WIDTH), MARK.tilt, theta, point);
  into.x = point.x;
  into.y = point.y;
  into.glow = (0.42 + 0.3 * orbitNear(theta)) * Math.min(1, Math.max(0.4, radius / PAIR_LIGHT_RADIUS));
  into.plasma = 0;
  into.paper = 0.85;
  return true;
}

/** How far the patch of the particle `index` kept for the plan has fused into it, in [0, 1]. */
function plannedFusion(index: number, flight: FlightFormation | null): number {
  if (!flight) {
    return 0;
  }
  const land = flightLand(index);
  return smoothstep(land - FLIGHT_MERGE, land, flight.progress);
}

/**
 * The particle of the field a dot's patch of streets lands as: its index
 * among those the field keeps for the plan, where it stands (world units),
 * and whether it lands in the mark's nucleus.
 */
export interface FlightTarget {
  readonly index: number;
  readonly x: number;
  readonly y: number;
  readonly nucleus: boolean;
}

/**
 * Where a dot of the plan stands at the flight's progress, starting from
 * `start` (world units), how much light it gives, and how much it has taken
 * on the colour of the mark's nucleus (`plasma`).
 *
 * Each dot flies on its own, from its `index` in the plan: it leaves its
 * street when the flow rising from the foot of the hero reaches it, and flies
 * along a curve of its own, bowed upwards, to the particle of the field its
 * patch of streets lands as (`target`), wherever that one stands, making way
 * for the `pointer` (world units, and its strength in [0, 1]) on its way. The
 * patch lands all at once: its dots fuse into the particle, which lights up
 * as they fade (writeFormations), and the plan goes on as particles of the
 * field. Dots the plan's canvas does not show at rest (outside the hero, or
 * past its foot), which have no particle (`null`), stay unseen. The ion
 * field's shader computes the same (scene.ts), following the particle where
 * it moves.
 */
export function flightPoint(
  start: { readonly x: number; readonly y: number },
  index: number,
  target: FlightTarget | null,
  flight: FlightFormation,
  out: { x: number; y: number; light: number; plasma: number },
  pointer?: { readonly x: number; readonly y: number; readonly strength: number },
): void {
  if (!target) {
    out.x = start.x;
    out.y = start.y;
    out.light = 0;
    out.plasma = 0;
    return;
  }
  const own = (channel: number) => flightRandom(index, channel);
  const { hero } = flight;
  const radius = Math.max(flight.mark.radius, 1e-6);
  // When it leaves (its own), and when its patch lands.
  const fromFoot = Math.min(1, Math.max(0, (start.y - (hero.top - hero.height)) / hero.height));
  const leave = Math.max(0, FLIGHT_DELAY + FLIGHT_RISE * fromFoot + FLIGHT_JITTER * (own(0) - 0.5));
  const land = flightLand(target.index);
  const p = smootherstep(leave, land, flight.progress);
  // How it gets there: a quadratic Bézier of its own, its middle lifted and pushed aside a little.
  const { x: tx, y: ty } = target;
  const aside = (own(5) - 0.5) * FLIGHT_BOW;
  const cx = (start.x + tx) / 2 - (ty - start.y) * aside;
  const cy = (start.y + ty) / 2 + (tx - start.x) * aside + FLIGHT_LIFT * radius * (0.5 + own(6));
  const q = 1 - p;
  out.x = q * q * start.x + 2 * q * p * cx + p * p * tx;
  out.y = q * q * start.y + 2 * q * p * cy + p * p * ty;
  // On its way, it makes way for the pointer.
  if (pointer && pointer.strength > 0) {
    const dx = out.x - pointer.x;
    const dy = out.y - pointer.y;
    const apart = Math.hypot(dx, dy);
    if (apart > 1e-6) {
      const near = apart / FLIGHT_PUSH_REACH;
      const push = 4 * FLIGHT_PUSH * p * q * pointer.strength * Math.exp(-near * near);
      out.x += (dx / apart) * push;
      out.y += (dy / apart) * push;
    }
  }
  // Its light: as painted, until its patch fuses into its particle.
  out.light = shownBy(hero, start.x, start.y) * (1 - smoothstep(land - FLIGHT_MERGE, land, flight.progress));
  out.plasma = target.nucleus ? smoothstep(0.4, 1, p) : 0;
}
