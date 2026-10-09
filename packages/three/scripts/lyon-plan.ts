/**
 * Writes the plan of Lyon that the rivers hero draws in dots
 * (apps/web/public/apercu/fleuves/lyon-plan.bin, see src/ion-field/city.ts)
 * from OpenStreetMap: streets, railways above ground, parks, woods and
 * meadows around the Presqu'île. © OpenStreetMap contributors, ODbL: the
 * hero credits them.
 *
 *   pnpm --filter @atomes/three plan:lyon
 *
 * Needs network access to an Overpass API instance (OVERPASS_URL, by default
 * the main one). The answers are kept in the system's temporary folder, so a
 * second run works offline and draws the same plan.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CITY_LAYERS, type CityLayer, type CityLine, encodeCityPlan } from "../src/ion-field/city";

const OVERPASS = process.env.OVERPASS_URL ?? "https://overpass-api.de/api/interpreter";
const CACHE = join(tmpdir(), "atomes-lyon-plan");
const TARGET = new URL("../../../apps/web/public/apercu/fleuves/lyon-plan.bin", import.meta.url);

// The projection of rivers.ts: kilometres east and north of 45.76° N, 4.85° E.
const LAT0 = 45.76;
const LON0 = 4.85;
const METRES_PER_LON = 111_320 * Math.cos((LAT0 * Math.PI) / 180);
const METRES_PER_LAT = 110_570;
/** What the plan covers, in metres: wide enough for a wide screen, tall enough for a phone. */
const EXTENT = { minX: -9000, maxX: 9000, minY: -7600, maxY: 7300 };
const BBOX = [
  LAT0 + EXTENT.minY / METRES_PER_LAT,
  LON0 + EXTENT.minX / METRES_PER_LON,
  LAT0 + EXTENT.maxY / METRES_PER_LAT,
  LON0 + EXTENT.maxX / METRES_PER_LON,
]
  .map((value) => value.toFixed(5))
  .join(",");

const QUERIES = {
  roads: `[out:json][timeout:240];way["highway"~"^(motorway|trunk|primary|secondary|tertiary|unclassified|residential|living_street|pedestrian|motorway_link|trunk_link|primary_link|secondary_link|tertiary_link)$"](${BBOX});out geom;`,
  rails: `[out:json][timeout:200];way["railway"~"^(rail|narrow_gauge|funicular)$"](${BBOX});out geom;`,
  green: `[out:json][timeout:200];(way["leisure"~"^(park|garden|golf_course|pitch)$"](${BBOX});way["landuse"~"^(forest|grass|meadow|cemetery|recreation_ground|allotments|vineyard|orchard)$"](${BBOX});way["natural"~"^(wood|scrub|grassland)$"](${BBOX});relation["leisure"="park"](${BBOX});relation["landuse"="forest"](${BBOX}););out geom;`,
} as const;

const ROAD_LAYERS: Record<string, CityLayer> = {
  motorway: CITY_LAYERS.major,
  motorway_link: CITY_LAYERS.major,
  trunk: CITY_LAYERS.major,
  trunk_link: CITY_LAYERS.major,
  primary: CITY_LAYERS.primary,
  primary_link: CITY_LAYERS.primary,
  secondary: CITY_LAYERS.primary,
  secondary_link: CITY_LAYERS.primary,
  tertiary: CITY_LAYERS.street,
  tertiary_link: CITY_LAYERS.street,
  unclassified: CITY_LAYERS.street,
  residential: CITY_LAYERS.minor,
  living_street: CITY_LAYERS.minor,
  pedestrian: CITY_LAYERS.minor,
};

/** Lines are simplified to this many metres, areas to a little more; points are rounded to `GRID` metres. */
const LINE_TOLERANCE = 3;
const AREA_TOLERANCE = 8;
const GRID = 2;
/** Green areas smaller than this (square metres) are left out: a lawn is not a park. */
const SMALLEST_AREA = 10_000;
/** Lines are kept this far beyond the plan's extent, so they leave it rather than stop at it. */
const MARGIN = 300;

interface OsmPoint {
  lat: number;
  lon: number;
}
interface OsmElement {
  type: "way" | "relation" | "node";
  tags?: Record<string, string>;
  geometry?: OsmPoint[];
  members?: Array<{ type: string; role: string; geometry?: OsmPoint[] }>;
}

async function overpass(name: keyof typeof QUERIES): Promise<OsmElement[]> {
  mkdirSync(CACHE, { recursive: true });
  const file = join(CACHE, `${name}.json`);
  try {
    return (JSON.parse(readFileSync(file, "utf8")) as { elements: OsmElement[] }).elements;
  } catch {
    // Not fetched yet.
  }
  for (let attempt = 1; ; attempt += 1) {
    const response = await fetch(OVERPASS, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", "user-agent": "atomes-lyon-plan/1.0" },
      body: new URLSearchParams({ data: QUERIES[name] }),
    });
    if (response.ok) {
      const text = await response.text();
      writeFileSync(file, text);
      return (JSON.parse(text) as { elements: OsmElement[] }).elements;
    }
    if (attempt >= 4) {
      throw new Error(`Overpass answered ${response.status} for ${name}.`);
    }
    await new Promise((resolve) => setTimeout(resolve, 5000 * 2 ** attempt));
  }
}

type Point = [number, number];

const project = ({ lat, lon }: OsmPoint): Point => [
  Math.round((lon - LON0) * METRES_PER_LON),
  Math.round((lat - LAT0) * METRES_PER_LAT),
];

/** Douglas–Peucker. */
function simplify(points: Point[], tolerance: number): Point[] {
  if (points.length < 3) {
    return points;
  }
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  const stack: Array<[number, number]> = [[0, points.length - 1]];
  while (stack.length > 0) {
    const [from, to] = stack.pop() as [number, number];
    const [ax, ay] = points[from] as Point;
    const [bx, by] = points[to] as Point;
    const length = Math.hypot(bx - ax, by - ay);
    let farthest = -1;
    let at = -1;
    for (let index = from + 1; index < to; index += 1) {
      const [px, py] = points[index] as Point;
      // A closed ring starts and ends on the same point: measure from that point.
      const distance =
        length > 0
          ? Math.abs((px - ax) * (by - ay) - (py - ay) * (bx - ax)) / length
          : Math.hypot(px - ax, py - ay);
      if (distance > farthest) {
        farthest = distance;
        at = index;
      }
    }
    if (farthest > tolerance) {
      keep[at] = 1;
      stack.push([from, at], [at, to]);
    }
  }
  return points.filter((_, index) => keep[index] === 1);
}

const within = ([x, y]: Point) =>
  x >= EXTENT.minX - MARGIN &&
  x <= EXTENT.maxX + MARGIN &&
  y >= EXTENT.minY - MARGIN &&
  y <= EXTENT.maxY + MARGIN;

/** The runs of a line inside the plan's extent (with one point beyond at each cut). */
function clip(points: Point[]): Point[][] {
  const runs: Point[][] = [];
  let run: Point[] = [];
  points.forEach((point, index) => {
    if (within(point)) {
      if (run.length === 0 && index > 0) {
        run.push(points[index - 1] as Point);
      }
      run.push(point);
    } else if (run.length > 0) {
      run.push(point);
      runs.push(run);
      run = [];
    }
  });
  if (run.length > 0) {
    runs.push(run);
  }
  return runs.filter((part) => part.length >= 2);
}

/** Joins the lines of a layer that meet end to end, where only those two meet: fewer, longer lines. */
function chain(lines: Point[][]): Point[][] {
  const key = ([x, y]: Point) => `${x},${y}`;
  const ends = new Map<string, number[]>();
  lines.forEach((line, index) => {
    for (const end of [line[0] as Point, line[line.length - 1] as Point]) {
      const list = ends.get(key(end)) ?? [];
      list.push(index);
      ends.set(key(end), list);
    }
  });
  const used = new Uint8Array(lines.length);
  const chains: Point[][] = [];
  const next = (end: Point, from: number) => {
    const list = ends.get(key(end));
    if (list?.length !== 2) {
      return -1;
    }
    const other = list[0] === from ? (list[1] ?? -1) : (list[0] ?? -1);
    return other >= 0 && used[other] === 0 ? other : -1;
  };
  lines.forEach((line, start) => {
    if (used[start]) {
      return;
    }
    used[start] = 1;
    let current = [...line];
    for (const forward of [true, false]) {
      let from = start;
      for (;;) {
        const end = (forward ? current[current.length - 1] : current[0]) as Point;
        const other = next(end, from);
        if (other < 0) {
          break;
        }
        used[other] = 1;
        from = other;
        const piece = lines[other] as Point[];
        const aligned = key(piece[0] as Point) === key(end) ? piece : [...piece].reverse();
        current = forward
          ? [...current, ...aligned.slice(1)]
          : [...[...aligned].reverse().slice(0, -1), ...current];
      }
    }
    chains.push(current);
  });
  return chains;
}

/** Joins the outer members of a multipolygon into closed rings. */
function rings(members: Point[][]): Point[][] {
  const open = members.map((member) => [...member]);
  const closed: Point[][] = [];
  const same = (a: Point, b: Point) => a[0] === b[0] && a[1] === b[1];
  while (open.length > 0) {
    let ring = open.shift() as Point[];
    let grown = true;
    while (!same(ring[0] as Point, ring[ring.length - 1] as Point) && grown) {
      grown = false;
      for (let index = 0; index < open.length; index += 1) {
        const piece = open[index] as Point[];
        const last = ring[ring.length - 1] as Point;
        if (same(piece[0] as Point, last)) {
          ring = [...ring, ...piece.slice(1)];
        } else if (same(piece[piece.length - 1] as Point, last)) {
          ring = [...ring, ...[...piece].reverse().slice(1)];
        } else {
          continue;
        }
        open.splice(index, 1);
        grown = true;
        break;
      }
    }
    if (same(ring[0] as Point, ring[ring.length - 1] as Point)) {
      closed.push(ring);
    }
  }
  return closed;
}

const area = (ring: Point[]) =>
  Math.abs(
    ring.reduce((sum, [x1, y1], index) => {
      const [x2, y2] = ring[(index + 1) % ring.length] as Point;
      return sum + x1 * y2 - x2 * y1;
    }, 0),
  ) / 2;

/** Morton order of a point on a 64 m grid: neighbouring lines end up next to each other in the file. */
function morton([x, y]: Point): number {
  const spread = (value: number) => {
    let v = Math.max(0, Math.min(1023, Math.floor((value + 16_384) / 64)));
    let out = 0;
    for (let bit = 0; bit < 10; bit += 1) {
      out |= ((v >> bit) & 1) << (2 * bit);
    }
    v = out;
    return v;
  };
  return spread(x) | (spread(y) << 1);
}

const byLayer = new Map<CityLayer, Point[][]>();
const add = (layer: CityLayer, points: Point[]) => {
  for (const part of clip(points)) {
    const list = byLayer.get(layer) ?? [];
    list.push(part);
    byLayer.set(layer, list);
  }
};

for (const element of await overpass("roads")) {
  const layer = ROAD_LAYERS[element.tags?.highway ?? ""];
  if (element.type === "way" && element.geometry && layer !== undefined) {
    add(layer, element.geometry.map(project));
  }
}
for (const element of await overpass("rails")) {
  const tags = element.tags ?? {};
  const underground = tags.tunnel === "yes" || (tags.layer ?? "0").startsWith("-");
  const kind = tags.railway ?? "";
  if (
    element.type === "way" &&
    element.geometry &&
    !underground &&
    /^(rail|narrow_gauge|funicular)$/.test(kind)
  ) {
    add(CITY_LAYERS.rail, element.geometry.map(project));
  }
}

const lines: CityLine[] = [];
for (const [layer, parts] of [...byLayer.entries()].sort(([a], [b]) => a - b)) {
  const chains = chain(parts)
    .map((points) => simplify(points, LINE_TOLERANCE))
    .sort((a, b) => morton(a[0] as Point) - morton(b[0] as Point));
  for (const points of chains) {
    lines.push({ layer, points: Int32Array.from(points.flat()) });
  }
}

const areas: Int32Array[] = [];
for (const element of await overpass("green")) {
  const outlines =
    element.type === "way" && element.geometry
      ? [element.geometry.map(project)]
      : rings(
          (element.members ?? [])
            .filter((member) => member.role === "outer" && member.geometry)
            .map((member) => (member.geometry ?? []).map(project)),
        );
  for (const outline of outlines) {
    const first = outline[0];
    const last = outline[outline.length - 1];
    if (!first || !last || first[0] !== last[0] || first[1] !== last[1] || area(outline) < SMALLEST_AREA) {
      continue;
    }
    if (!outline.some(within)) {
      continue;
    }
    const ring = simplify(outline, AREA_TOLERANCE).slice(0, -1);
    if (ring.length >= 3) {
      areas.push(Int32Array.from(ring.flat()));
    }
  }
}
areas.sort((a, b) => morton([a[0] ?? 0, a[1] ?? 0]) - morton([b[0] ?? 0, b[1] ?? 0]));

const bytes = encodeCityPlan({ lines, areas }, GRID);
mkdirSync(new URL(".", TARGET), { recursive: true });
writeFileSync(TARGET, bytes);
const points = lines.reduce((sum, line) => sum + line.points.length / 2, 0);
console.log(
  `Wrote ${TARGET.pathname}: ${lines.length} lines (${points} points), ${areas.length} green areas, ${(bytes.length / 1024).toFixed(0)} KB.`,
);
