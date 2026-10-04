import { schoolColors } from "@atomes/tokens";

/**
 * Deterministic starting layout of the ion field (docs/02-design.md, moment 1).
 *
 * Pure data, no three.js: the server renders the static poster from the first
 * particles, and the live scene starts from exactly the same positions, so the
 * hand-over from poster to WebGL is seamless.
 */

export const SCHOOL_KEYS = Object.keys(schoolColors) as Array<keyof typeof schoolColors>;

export const ION_FIELD_SEED = 20_270_211;

/** Particle roles once the field condenses into the logo mark. */
export const MARK_ROLES = { orbit: 0, nucleus: 1, electron: 2 } as const;

/**
 * Logo mark geometry (apps/web/app/icon.svg), in units of the orbit's major
 * radius: an ellipse tilted by 30°, a nucleus and an electron on the orbit.
 */
export const MARK = {
  orbitMinor: 9 / 22,
  tilt: Math.PI / 6,
  nucleusRadius: 6 / 22,
  electron: { x: 18 / 22, y: 10 / 22, radius: 3.5 / 22 },
} as const;

export interface IonFieldLayout {
  readonly count: number;
  /** Starting positions, normalised to [-1, 1]² (x is stretched by the aspect ratio when rendered). */
  readonly positions: Float32Array;
  /** Index into `SCHOOL_KEYS`. */
  readonly schools: Uint8Array;
  /** +1 or -1. Particles 2k and 2k+1 are partners with opposite charges. */
  readonly charges: Int8Array;
  /** Radius, in units of half the viewport height. */
  readonly sizes: Float32Array;
  /** Random phase in [0, 1), drives each pair's bonding rhythm and the twinkle. */
  readonly phases: Float32Array;
  /** Position in the logo mark, in units of the orbit's major radius. */
  readonly targets: Float32Array;
  readonly roles: Uint8Array;
}

/** mulberry32: small, fast, good enough for visuals, reproducible from a seed. */
export function createRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
const GOLDEN_RATIO_FRACTION = (Math.sqrt(5) - 1) / 2;

/** Role pattern repeated every 25 particles: 7 nucleus, 2 electron, 16 orbit. */
function roleOf(index: number): number {
  const slot = index % 25;
  if (slot < 7) {
    return MARK_ROLES.nucleus;
  }
  if (slot < 9) {
    return MARK_ROLES.electron;
  }
  return MARK_ROLES.orbit;
}

function expectedRoleCount(count: number, role: number): number {
  let total = 0;
  for (let index = 0; index < Math.min(count, 25); index += 1) {
    if (roleOf(index) === role) {
      total += 1;
    }
  }
  return Math.max(1, Math.ceil((count / 25) * total));
}

export function createIonFieldLayout(count: number, seed: number = ION_FIELD_SEED): IonFieldLayout {
  if (!Number.isInteger(count) || count < 2 || count % 2 !== 0) {
    throw new RangeError("The ion field needs an even number of particles (pairs of opposite charges).");
  }
  const random = createRandom(seed);
  const positions = new Float32Array(count * 2);
  const schools = new Uint8Array(count);
  const charges = new Int8Array(count);
  const sizes = new Float32Array(count);
  const phases = new Float32Array(count);
  const targets = new Float32Array(count * 2);
  const roles = new Uint8Array(count);

  const nucleusTotal = expectedRoleCount(count, MARK_ROLES.nucleus);
  const electronTotal = expectedRoleCount(count, MARK_ROLES.electron);
  const roleCounters = [0, 0, 0];

  // A few "molecules": clusters that make the field feel structured rather than uniform noise.
  const clusters = Array.from({ length: 9 }, () => ({ x: random() * 1.8 - 0.9, y: random() * 1.8 - 0.9 }));

  for (let index = 0; index < count; index += 1) {
    const partner = index ^ 1;
    const isSecondOfPair = index % 2 === 1;
    let x: number;
    let y: number;
    const placement = random();
    if (isSecondOfPair && placement < 0.35) {
      // Starts already bonded to its partner.
      const angle = random() * Math.PI * 2;
      const distance = 0.02 + random() * 0.05;
      x = (positions[partner * 2] ?? 0) + Math.cos(angle) * distance;
      y = (positions[partner * 2 + 1] ?? 0) + Math.sin(angle) * distance;
    } else if (placement < 0.5) {
      const cluster = clusters[Math.floor(random() * clusters.length)] ?? { x: 0, y: 0 };
      const angle = random() * Math.PI * 2;
      const distance = Math.sqrt(random()) * 0.22;
      x = cluster.x + Math.cos(angle) * distance;
      y = cluster.y + Math.sin(angle) * distance;
    } else {
      x = random() * 2 - 1;
      y = random() * 2 - 1;
    }
    positions[index * 2] = Math.max(-1, Math.min(1, x));
    positions[index * 2 + 1] = Math.max(-1, Math.min(1, y));

    schools[index] = Math.floor(random() * SCHOOL_KEYS.length);
    charges[index] = isSecondOfPair ? -1 : 1;
    const heavy = random() < 0.06;
    sizes[index] = heavy ? 0.011 + random() * 0.008 : 0.0035 + random() * 0.0055;
    phases[index] = random();

    const role = roleOf(index);
    roles[index] = role;
    const order = roleCounters[role] ?? 0;
    roleCounters[role] = order + 1;
    let tx: number;
    let ty: number;
    if (role === MARK_ROLES.nucleus) {
      // Sunflower (Vogel) spiral: an even, filled disc whatever the count.
      const radius = MARK.nucleusRadius * Math.sqrt((order + 0.5) / nucleusTotal);
      tx = Math.cos(order * GOLDEN_ANGLE) * radius;
      ty = Math.sin(order * GOLDEN_ANGLE) * radius;
    } else if (role === MARK_ROLES.electron) {
      const radius = MARK.electron.radius * Math.sqrt((order + 0.5) / electronTotal);
      tx = MARK.electron.x + Math.cos(order * GOLDEN_ANGLE) * radius;
      ty = MARK.electron.y + Math.sin(order * GOLDEN_ANGLE) * radius;
    } else {
      // Evenly spread along the tilted ellipse, with a thin glowing thickness.
      const t = 2 * Math.PI * ((order * GOLDEN_RATIO_FRACTION) % 1);
      const thickness = 1 + (random() - 0.5) * 0.05;
      const ex = Math.cos(t) * thickness;
      const ey = Math.sin(t) * MARK.orbitMinor * thickness;
      tx = ex * Math.cos(MARK.tilt) - ey * Math.sin(MARK.tilt);
      ty = ex * Math.sin(MARK.tilt) + ey * Math.cos(MARK.tilt);
    }
    targets[index * 2] = tx;
    targets[index * 2 + 1] = ty;
  }

  return { count, positions, schools, charges, sizes, phases, targets, roles };
}
