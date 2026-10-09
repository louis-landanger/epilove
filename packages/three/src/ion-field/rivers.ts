/**
 * The Saône and the Rhône through Lyon, for the rivers formation
 * (formations.ts) and the static drawing of the hero that shows them
 * (`/apercu/fleuves`): both rivers come down from the north, the Saône past
 * Vaise (where four of the schools share a campus) and around Fourvière, the
 * Rhône from the east, and they meet at the Confluence, south of the
 * Presqu'île.
 *
 * Courses from OpenStreetMap (© OpenStreetMap contributors, ODbL), ways of
 * `waterway=river` named « La Saône » and « Le Rhône » between latitudes
 * 45.70 and 45.82, simplified to about 12 m. In kilometres, x east and y
 * north of 45.76° N, 4.85° E (equirectangular projection, fine at this
 * scale).
 */

/** Each river from where it enters the map to the Confluence, then the merged river, flat x, y pairs. */
export const SAONE_COURSE: readonly number[] = [
  0.626, 6.806, 0.568, 6.572, 0.501, 6.461, 0.27, 6.293, -0.194, 6.005, -0.431, 5.721, -0.53, 5.516, -0.595,
  5.082, -0.708, 4.686, -1.0, 4.239, -1.132, 4.138, -1.281, 4.075, -1.616, 4.004, -2.031, 3.676, -2.277,
  3.446, -2.538, 3.167, -2.637, 3.024, -2.77, 2.751, -2.968, 2.436, -3.164, 2.024, -3.181, 1.849, -3.125,
  1.608, -2.932, 1.395, -2.799, 0.959, -2.743, 0.883, -2.56, 0.79, -2.425, 0.768, -2.138, 0.849, -1.87, 0.878,
  -1.718, 0.828, -1.6, 0.727, -1.516, 0.502, -1.516, 0.34, -1.59, 0.026, -1.875, -0.373, -2.01, -0.75, -2.127,
  -0.934, -2.216, -1.022, -2.449, -1.193, -2.564, -1.319, -2.686, -1.491, -2.775, -1.663, -2.822, -1.802,
  -2.866, -2.151, -2.866, -2.358, -2.78, -2.969, -2.74, -3.109, -2.586, -3.239, -2.535, -3.445, -2.505,
  -3.491, -2.442, -3.521,
];
export const RHONE_COURSE: readonly number[] = [
  5.761, 5.355, 5.74, 5.284, 5.59, 5.047, 5.505, 4.794, 5.482, 4.599, 5.516, 4.399, 5.371, 4.169, 5.131,
  4.011, 5.004, 3.978, 4.933, 3.994, 4.842, 4.05, 4.55, 4.426, 4.467, 4.478, 4.288, 4.529, 4.097, 4.532,
  3.959, 4.459, 3.828, 4.336, 3.768, 4.237, 3.713, 4.054, 3.706, 3.914, 3.636, 3.564, 3.634, 3.457, 3.537,
  3.239, 3.371, 3.121, 3.295, 3.093, 3.171, 3.104, 2.92, 3.29, 2.749, 3.553, 2.591, 3.726, 2.439, 3.809,
  2.312, 3.838, 2.239, 3.834, 2.131, 3.759, 2.058, 3.615, 2.017, 3.475, 2.051, 3.327, 2.001, 3.271, 1.945,
  3.244, 1.614, 3.225, 1.431, 3.11, 1.189, 3.022, 1.071, 2.998, 0.858, 2.978, 0.47, 2.99, 0.31, 2.97, 0.076,
  2.861, -0.221, 2.628, -0.47, 2.298, -0.569, 2.084, -0.773, 1.532, -0.806, 1.309, -0.791, 0.57, -0.806,
  0.268, -0.877, -0.278, -1.465, -1.431, -1.818, -1.978, -2.134, -2.521, -2.284, -2.85, -2.349, -3.36, -2.442,
  -3.521,
];
export const MERGED_COURSE: readonly number[] = [
  -2.442, -3.521, -2.31, -4.369, -2.146, -4.854, -2.067, -5.009, -1.967, -5.147, -1.832, -5.27, -1.708,
  -5.351, -1.317, -5.529, -0.957, -5.82, -0.89, -6.112, -0.802, -6.688, -0.821, -7.073, -0.854, -7.271,
];

/** What the map shows, in kilometres: the formation and the static drawing fit it to their box. */
export const RIVER_MAP = { minX: -3.8, maxX: 5.8, minY: -7.3, maxY: 6.9 } as const;

/** Where to name the rivers and the places, as fractions of the map from its top left corner. */
export const RIVER_PLACES = {
  saone: [0.1302, 0.2641],
  rhone: [0.6088, 0.2347],
  confluence: [0.1414, 0.7338],
  vaise: [0.0277, 0.3575],
} as const;

/** How far each river runs beyond the map, in kilometres: it comes into sight and leaves it already flowing. */
const RUN_UP = 2.5;
const RUN_OUT = 3;

/** A river's course from its source, out of sight, to the merged river's exit, out of sight too. */
export interface RiverPath {
  /** Flat x, y pairs, in kilometres. */
  readonly points: Float64Array;
  /** Distance from the start of the course to each point. */
  readonly lengths: Float64Array;
  readonly total: number;
  /** Distance from the start to the Confluence. */
  readonly confluence: number;
  /** Where the course comes into sight (after its run-up) and leaves it (before its run-out). */
  readonly enters: number;
  readonly leaves: number;
}

/** Prolongs a course by `km` beyond its end, along the direction of its last few hundred metres. */
function prolong(course: readonly number[], km: number): number[] {
  const count = course.length / 2;
  const endX = course[2 * count - 2] ?? 0;
  const endY = course[2 * count - 1] ?? 0;
  let backX = endX;
  let backY = endY;
  for (let point = count - 2; point >= 0; point -= 1) {
    backX = course[2 * point] ?? 0;
    backY = course[2 * point + 1] ?? 0;
    if (Math.hypot(endX - backX, endY - backY) > 0.6) {
      break;
    }
  }
  const norm = Math.hypot(endX - backX, endY - backY) || 1;
  return [...course, endX + ((endX - backX) / norm) * km, endY + ((endY - backY) / norm) * km];
}

/** The same course, walked from its end to its start. */
function reversed(course: readonly number[]): number[] {
  const out: number[] = [];
  for (let point = course.length / 2 - 1; point >= 0; point -= 1) {
    out.push(course[2 * point] ?? 0, course[2 * point + 1] ?? 0);
  }
  return out;
}

function riverPath(course: readonly number[]): RiverPath {
  const upstream = reversed(prolong(reversed(course), RUN_UP));
  const downstream = prolong(MERGED_COURSE, RUN_OUT);
  const flat = [...upstream, ...downstream.slice(2)];
  const points = Float64Array.from(flat);
  const lengths = new Float64Array(points.length / 2);
  for (let point = 1; point < lengths.length; point += 1) {
    lengths[point] =
      (lengths[point - 1] ?? 0) +
      Math.hypot(
        (points[2 * point] ?? 0) - (points[2 * point - 2] ?? 0),
        (points[2 * point + 1] ?? 0) - (points[2 * point - 1] ?? 0),
      );
  }
  const total = lengths[lengths.length - 1] ?? 0;
  const confluence = lengths[upstream.length / 2 - 1] ?? 0;
  return { points, lengths, total, confluence, enters: RUN_UP, leaves: total - RUN_OUT };
}

/** The Saône's and the Rhône's courses, each continued by the merged river. */
export const SAONE_PATH: RiverPath = riverPath(SAONE_COURSE);
export const RHONE_PATH: RiverPath = riverPath(RHONE_COURSE);

/**
 * The point at distance `s` along `path` (clamped to the course), and the
 * unit normal to its left bank looking downstream (towards the east for a
 * river flowing south), in kilometres.
 */
export function riverPoint(
  path: RiverPath,
  s: number,
  into: { x: number; y: number; nx: number; ny: number },
): void {
  const { points, lengths } = path;
  const distance = Math.min(path.total, Math.max(0, s));
  let low = 0;
  let high = lengths.length - 1;
  while (high - low > 1) {
    const middle = (low + high) >> 1;
    if ((lengths[middle] ?? 0) <= distance) {
      low = middle;
    } else {
      high = middle;
    }
  }
  const ax = points[2 * low] ?? 0;
  const ay = points[2 * low + 1] ?? 0;
  const bx = points[2 * high] ?? 0;
  const by = points[2 * high + 1] ?? 0;
  const segment = (lengths[high] ?? 0) - (lengths[low] ?? 0) || 1;
  const f = (distance - (lengths[low] ?? 0)) / segment;
  const dx = (bx - ax) / segment;
  const dy = (by - ay) / segment;
  into.x = ax + (bx - ax) * f;
  into.y = ay + (by - ay) * f;
  into.nx = -dy;
  into.ny = dx;
}
