import { createRandom } from "./layout";
import { MERGED_COURSE } from "./rivers";

/**
 * The plan of Lyon that the rivers hero (`/apercu/fleuves`) draws in dots:
 * streets, railways and green areas from OpenStreetMap (© OpenStreetMap
 * contributors, ODbL), in the projection of rivers.ts (x east and y north of
 * 45.76° N, 4.85° E).
 *
 * The plan travels as a small binary file (scripts/lyon-plan.ts writes it):
 * polylines and rings on a grid of a few metres, each point a zigzag varint
 * delta from the previous one. The dots are laid out along them in the
 * browser, from a seed, so every device draws the same plan.
 */

/** What each line of the plan is: the drawing lights the main roads most, the railways least. */
export const CITY_LAYERS = {
  /** Motorways and trunk roads. */
  major: 0,
  /** Primary and secondary roads. */
  primary: 1,
  /** Tertiary and unclassified roads. */
  street: 2,
  /** Residential and pedestrian streets. */
  minor: 3,
  rail: 4,
  /** Parks, woods and meadows: areas, stippled. */
  green: 5,
} as const;

export type CityLayer = (typeof CITY_LAYERS)[keyof typeof CITY_LAYERS];

export interface CityLine {
  readonly layer: CityLayer;
  /** Flat x, y pairs, in metres. */
  readonly points: Int32Array;
}

export interface CityPlan {
  readonly lines: readonly CityLine[];
  /** Outer rings of the green areas, flat x, y pairs in metres. */
  readonly areas: readonly Int32Array[];
}

const MAGIC = [0x41, 0x50, 0x4c, 0x31] as const; // "APL1"

const zigzag = (value: number) => ((value << 1) ^ (value >> 31)) >>> 0;
const unzigzag = (value: number) => (value >>> 1) ^ -(value & 1);

/** Encodes a plan (see the module comment), its points rounded to `unit` metres. */
export function encodeCityPlan(plan: CityPlan, unit = 1): Uint8Array {
  const bytes: number[] = [...MAGIC];
  const varint = (value: number) => {
    let rest = value >>> 0;
    while (rest >= 0x80) {
      bytes.push((rest & 0x7f) | 0x80);
      rest >>>= 7;
    }
    bytes.push(rest);
  };
  // Each line starts from the start of the previous one (the lines come in
  // spatial order, so they start close), then steps from point to point.
  let startX = 0;
  let startY = 0;
  const points = (flat: Int32Array) => {
    varint(flat.length / 2);
    let x = startX;
    let y = startY;
    for (let index = 0; index + 1 < flat.length; index += 2) {
      const nextX = Math.round((flat[index] ?? 0) / unit);
      const nextY = Math.round((flat[index + 1] ?? 0) / unit);
      varint(zigzag(nextX - x));
      varint(zigzag(nextY - y));
      x = nextX;
      y = nextY;
      if (index === 0) {
        startX = x;
        startY = y;
      }
    }
  };
  varint(unit);
  varint(plan.lines.length);
  varint(plan.areas.length);
  for (const line of plan.lines) {
    bytes.push(line.layer);
    points(line.points);
  }
  for (const area of plan.areas) {
    points(area);
  }
  return Uint8Array.from(bytes);
}

/** Decodes a plan written by `encodeCityPlan`; throws on anything else. */
export function decodeCityPlan(source: ArrayBuffer | Uint8Array): CityPlan {
  const bytes = source instanceof Uint8Array ? source : new Uint8Array(source);
  if (MAGIC.some((byte, index) => bytes[index] !== byte)) {
    throw new Error("Not a city plan.");
  }
  let at = MAGIC.length;
  const varint = () => {
    let value = 0;
    let shift = 0;
    for (;;) {
      if (at >= bytes.length) {
        throw new Error("Truncated city plan.");
      }
      const byte = bytes[at] ?? 0;
      at += 1;
      value += (byte & 0x7f) * 2 ** shift;
      if (byte < 0x80) {
        return value;
      }
      shift += 7;
    }
  };
  let startX = 0;
  let startY = 0;
  const unit = varint();
  const points = () => {
    const flat = new Int32Array(varint() * 2);
    let x = startX;
    let y = startY;
    for (let index = 0; index < flat.length; index += 2) {
      x += unzigzag(varint());
      y += unzigzag(varint());
      flat[index] = x * unit;
      flat[index + 1] = y * unit;
      if (index === 0) {
        startX = x;
        startY = y;
      }
    }
    return flat;
  };
  const lineCount = varint();
  const areaCount = varint();
  const lines: CityLine[] = [];
  for (let line = 0; line < lineCount; line += 1) {
    const layer = bytes[at] ?? 0;
    at += 1;
    if (layer > CITY_LAYERS.rail) {
      throw new Error("Unknown layer in the city plan.");
    }
    lines.push({ layer: layer as CityLayer, points: points() });
  }
  const areas: Int32Array[] = [];
  for (let area = 0; area < areaCount; area += 1) {
    areas.push(points());
  }
  return { lines, areas };
}

/** Metres between two dots along a line, per layer: the main roads read as denser strings of light. */
export const CITY_DOT_SPACING: readonly number[] = [22, 24, 27, 30, 34];
/** Metres between two dots of a green area, on average. */
export const CITY_GREEN_STEP = 40;
/** Over the last kilometre before the plan's edge, the dots fade out: no hard border on wide screens. */
const EDGE_FADE = 1000;
/** Metres a dot may stray from its line, either side. */
const JITTER = 1.5;

export interface CityDots {
  readonly count: number;
  /** Kilometres, x east and y north (rivers.ts). */
  readonly x: Float32Array;
  readonly y: Float32Array;
  readonly layer: Uint8Array;
  /** The dot's own light, around 1 (lower near the plan's edge). */
  readonly light: Float32Array;
  /** When the dot lights up as the plan is revealed, in [0, 1]: from the Confluence outwards. */
  readonly order: Float32Array;
}

/** Even-odd rule: is (x, y) inside the ring? */
function insideRing(ring: Int32Array, x: number, y: number): boolean {
  let inside = false;
  const count = ring.length / 2;
  for (let index = 0, previous = count - 1; index < count; previous = index, index += 1) {
    const xi = ring[2 * index] ?? 0;
    const yi = ring[2 * index + 1] ?? 0;
    const xj = ring[2 * previous] ?? 0;
    const yj = ring[2 * previous + 1] ?? 0;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

/**
 * Lays the dots of the plan out: along each line, one every
 * `CITY_DOT_SPACING[layer]` metres or so, slightly off the line; in each
 * green area, one per `CITY_GREEN_STEP` square, at random. The same seed
 * gives the same dots.
 */
export function cityDots(plan: CityPlan, seed = 20_271_009): CityDots {
  const random = createRandom(seed);
  const xs: number[] = [];
  const ys: number[] = [];
  const layers: number[] = [];

  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const { points } of plan.lines) {
    for (let index = 0; index + 1 < points.length; index += 2) {
      const x = points[index] ?? 0;
      const y = points[index + 1] ?? 0;
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
  }

  for (const { layer, points } of plan.lines) {
    const spacing = CITY_DOT_SPACING[layer] ?? 30;
    let next = random() * spacing;
    for (let index = 2; index + 1 < points.length; index += 2) {
      const ax = points[index - 2] ?? 0;
      const ay = points[index - 1] ?? 0;
      const dx = (points[index] ?? 0) - ax;
      const dy = (points[index + 1] ?? 0) - ay;
      const length = Math.hypot(dx, dy);
      if (length === 0) {
        continue;
      }
      const ux = dx / length;
      const uy = dy / length;
      while (next < length) {
        const aside = (random() * 2 - 1) * JITTER;
        xs.push(ax + ux * next - uy * aside);
        ys.push(ay + uy * next + ux * aside);
        layers.push(layer);
        next += spacing * (0.85 + random() * 0.3);
      }
      next -= length;
    }
  }

  const taken = new Set<number>();
  for (const ring of plan.areas) {
    let left = Number.POSITIVE_INFINITY;
    let bottom = Number.POSITIVE_INFINITY;
    let right = Number.NEGATIVE_INFINITY;
    let top = Number.NEGATIVE_INFINITY;
    for (let index = 0; index + 1 < ring.length; index += 2) {
      left = Math.min(left, ring[index] ?? 0);
      right = Math.max(right, ring[index] ?? 0);
      bottom = Math.min(bottom, ring[index + 1] ?? 0);
      top = Math.max(top, ring[index + 1] ?? 0);
    }
    for (let column = Math.floor(left / CITY_GREEN_STEP); column * CITY_GREEN_STEP < right; column += 1) {
      for (let row = Math.floor(bottom / CITY_GREEN_STEP); row * CITY_GREEN_STEP < top; row += 1) {
        // One dot per square of the grid, even where two areas overlap.
        const key = (column + 32_768) * 65_536 + (row + 32_768);
        const x = (column + random()) * CITY_GREEN_STEP;
        const y = (row + random()) * CITY_GREEN_STEP;
        if (!taken.has(key) && insideRing(ring, x, y)) {
          taken.add(key);
          xs.push(x);
          ys.push(y);
          layers.push(CITY_LAYERS.green);
        }
      }
    }
  }

  const count = xs.length;
  const x = new Float32Array(count);
  const y = new Float32Array(count);
  const light = new Float32Array(count);
  const order = new Float32Array(count);
  const confluenceX = (MERGED_COURSE[0] ?? 0) * 1000;
  const confluenceY = (MERGED_COURSE[1] ?? 0) * 1000;
  let farthest = 1;
  for (let index = 0; index < count; index += 1) {
    const px = xs[index] ?? 0;
    const py = ys[index] ?? 0;
    x[index] = px / 1000;
    y[index] = py / 1000;
    const edge = Math.min(px - minX, maxX - px, py - minY, maxY - py);
    const fade = Math.min(1, Math.max(0, edge / EDGE_FADE));
    light[index] = (0.75 + random() * 0.5) * fade * fade * (3 - 2 * fade);
    const distance = Math.hypot(px - confluenceX, py - confluenceY);
    order[index] = distance;
    farthest = Math.max(farthest, distance);
  }
  for (let index = 0; index < count; index += 1) {
    // From the Confluence outwards, a little ragged.
    order[index] = Math.min(1, Math.max(0, ((order[index] ?? 0) / farthest) * 0.92 + random() * 0.08));
  }
  return { count, x, y, layer: Uint8Array.from(layers), light, order };
}
