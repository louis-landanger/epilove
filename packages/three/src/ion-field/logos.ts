import { srgbToLinear } from "../colors";
import { SCHOOL_KEYS } from "./layout";

/**
 * The schools' logos as the atoms draw them beside the waiting list form
 * (school-logos.gen.ts, docs/adr/0016-logos-des-ecoles.md): for any number
 * of particles, places that fill a logo's ink evenly and places on its
 * edges, in its box (y down), each particle in about the same part of every
 * logo, so that one logo turns into the next with each atom moving a short
 * way; and the logo's colours at each place.
 */

// Any letter is a command, so that one it cannot draw is refused rather than skipped.
const TOKEN = /[A-Za-z]|[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g;
const COMMAND = /^[A-Za-z]$/;

/**
 * Cuts SVG path data made of straight lines (M, L, H, V, Z, absolute or
 * relative, pairs after a move being lines) into its segments: x0, y0, x1,
 * y1 of each. Throws on anything else: the logos are traced into straight
 * segments.
 */
export function outlineOf(path: string): Float32Array {
  const tokens = path.match(TOKEN) ?? [];
  const segments: number[] = [];
  let index = 0;
  let command = "";
  let x = 0;
  let y = 0;
  let startX = 0;
  let startY = 0;

  const read = (): number => {
    const token = tokens[index];
    if (token === undefined || COMMAND.test(token)) {
      throw new SyntaxError(`Expected a number in the path "${path.slice(0, 40)}…"`);
    }
    index += 1;
    return Number(token);
  };
  const lineTo = (toX: number, toY: number) => {
    if (toX !== x || toY !== y) {
      segments.push(x, y, toX, toY);
    }
    x = toX;
    y = toY;
  };

  while (index < tokens.length) {
    const token = tokens[index] ?? "";
    if (COMMAND.test(token)) {
      command = token;
      index += 1;
    } else if (command === "" || command === "Z" || command === "z") {
      throw new SyntaxError(`Unexpected number in the path "${path.slice(0, 40)}…"`);
    }
    const relative = command === command.toLowerCase();
    const baseX = relative ? x : 0;
    const baseY = relative ? y : 0;
    switch (command.toUpperCase()) {
      case "M":
        x = startX = baseX + read();
        y = startY = baseY + read();
        // More pairs after a move are lines.
        command = relative ? "l" : "L";
        break;
      case "L":
        lineTo(baseX + read(), baseY + read());
        break;
      case "H":
        lineTo(baseX + read(), y);
        break;
      case "V":
        lineTo(x, baseY + read());
        break;
      case "Z":
        lineTo(startX, startY);
        break;
      default:
        throw new SyntaxError(`Unsupported command "${command}" in the path "${path.slice(0, 40)}…"`);
    }
  }
  return Float32Array.from(segments);
}

/** A logo cut into rows and columns a quarter of a unit wide (a quarter of a percent of its longer side). */
const STEP = 0.25;

/** Where the outline crosses lines evenly spaced across a logo, line after line. */
interface Crossings {
  /** Width of each line's band. */
  readonly step: number;
  /** Positions of the crossings along each line, in order. */
  readonly at: Float32Array;
  /** Where each line's crossings start in `at`, and where the last line's end. */
  readonly starts: Uint32Array;
}

/**
 * Crossings of the outline's segments with lines across the middle of bands
 * `step` wide: rows (`x0`, `y0` the segments' x and y) or, swapping the
 * coordinates, columns. Between two crossings in turn, the ink (even-odd).
 */
function crossingsOf(segments: Float32Array, extent: number, columns: boolean): Crossings {
  const lines = Math.max(1, Math.ceil(extent / STEP));
  const step = extent / lines;
  const along = columns ? 1 : 0;
  const across = columns ? 0 : 1;
  const at: number[] = [];
  const starts = new Uint32Array(lines + 1);
  const crossings: number[] = [];
  for (let line = 0; line < lines; line += 1) {
    starts[line] = at.length;
    const level = (line + 0.5) * step;
    crossings.length = 0;
    for (let offset = 0; offset < segments.length; offset += 4) {
      const a = segments[offset + across] ?? 0;
      const b = segments[offset + 2 + across] ?? 0;
      // Half open, so that a corner on the line counts once.
      if (a <= level !== b <= level) {
        const from = segments[offset + along] ?? 0;
        crossings.push(from + ((level - a) / (b - a)) * ((segments[offset + 2 + along] ?? 0) - from));
      }
    }
    crossings.sort((p, q) => p - q);
    at.push(...crossings);
  }
  starts[lines] = at.length;
  return { step, at: Float32Array.from(at), starts };
}

/**
 * A logo as school-logos.gen.ts writes it: its box, its outline, and its
 * colours over a grid of square cells `cell` wide, `columns` across, row by
 * row from the top left (`rgb`: base64 of red, green, blue bytes, sRGB).
 */
export interface Logo {
  readonly width: number;
  readonly height: number;
  readonly path: string;
  readonly colors?: { readonly cell: number; readonly columns: number; readonly rgb: string };
}

/** A logo's colours, read: red, green, blue of each cell of its grid, row by row, in linear light. */
export interface LogoColors {
  readonly cell: number;
  readonly columns: number;
  readonly rows: number;
  readonly rgb: Float32Array;
}

/**
 * A logo ready to be drawn: its box, its outline, the outline's crossings
 * with its rows and columns, the ink from the top down to the end of each
 * row, and its colours (none for a logo without).
 */
export interface LogoShape {
  readonly width: number;
  readonly height: number;
  /** x0, y0, x1, y1 of each segment of the outline. */
  readonly segments: Float32Array;
  readonly rows: Crossings;
  readonly columns: Crossings;
  readonly ink: Float32Array;
  readonly colors: LogoColors | null;
}

function colorsOf(colors: Logo["colors"]): LogoColors | null {
  if (!colors || !(colors.cell > 0) || !(colors.columns >= 1)) {
    return null;
  }
  const bytes = atob(colors.rgb);
  const rows = Math.floor(bytes.length / 3 / colors.columns);
  if (rows < 1) {
    return null;
  }
  const rgb = new Float32Array(colors.columns * rows * 3);
  for (let index = 0; index < rgb.length; index += 1) {
    rgb[index] = srgbToLinear(bytes.charCodeAt(index) / 255);
  }
  return { cell: colors.cell, columns: colors.columns, rows, rgb };
}

export function logoShape(logo: Logo): LogoShape {
  const segments = outlineOf(logo.path);
  const rows = crossingsOf(segments, logo.height, false);
  const columns = crossingsOf(segments, logo.width, true);
  const ink = new Float32Array(rows.starts.length - 1);
  let total = 0;
  for (let row = 0; row < ink.length; row += 1) {
    const end = rows.starts[row + 1] ?? 0;
    for (let index = rows.starts[row] ?? 0; index + 1 < end; index += 2) {
      total += (rows.at[index + 1] ?? 0) - (rows.at[index] ?? 0);
    }
    ink[row] = total;
  }
  return {
    width: logo.width,
    height: logo.height,
    segments,
    rows,
    columns,
    ink,
    colors: colorsOf(logo.colors),
  };
}

/**
 * Place in the ink for the point (u, v) of the unit square, so that points
 * spread evenly over the square spread evenly over the ink: `u` goes down the
 * logo, through as much ink as it is a fraction of, and `v` along the row it
 * lands in. The particles' formation coordinates (layout.ts) cover the square
 * evenly however many there are, so they fill the logo evenly too, each in
 * about the same part of every logo. Allocation-free.
 */
export function logoFillPoint(shape: LogoShape, u: number, v: number, out: { x: number; y: number }): void {
  const { ink, rows } = shape;
  const count = ink.length;
  const total = ink[count - 1] ?? 0;
  if (total <= 0) {
    out.x = shape.width / 2;
    out.y = shape.height / 2;
    return;
  }
  const target = (u - Math.floor(u)) * total;
  // The first row whose ink reaches past the target.
  let low = 0;
  let high = count - 1;
  while (low < high) {
    const middle = (low + high) >> 1;
    if ((ink[middle] ?? 0) <= target) {
      low = middle + 1;
    } else {
      high = middle;
    }
  }
  const before = low > 0 ? (ink[low - 1] ?? 0) : 0;
  const length = (ink[low] ?? 0) - before;
  out.y = (low + (length > 0 ? (target - before) / length : 0.5)) * rows.step;
  let left = (v - Math.floor(v)) * length;
  const end = rows.starts[low + 1] ?? 0;
  for (let index = rows.starts[low] ?? 0; index + 1 < end; index += 2) {
    const from = rows.at[index] ?? 0;
    const to = rows.at[index + 1] ?? 0;
    if (left <= to - from) {
      out.x = from + left;
      return;
    }
    left -= to - from;
  }
  out.x = rows.at[end - 1] ?? shape.width / 2;
}

/**
 * Place on the logo's edges for the point (u, v) of the unit square: where
 * the outline crosses one of its rows (`columns` false: `u` picks the row,
 * down the logo, `v` the crossing, left to right) or one of its columns (`v`
 * picks the column, across the logo, `u` the crossing, top to bottom), each
 * line as often as it is crossed, so that each particle lands on about the
 * same part of every logo's edges. Rows catch the steep edges and columns the
 * flat ones: half of each, the edges get their atoms evenly. Allocation-free.
 */
export function logoEdgePoint(
  shape: LogoShape,
  u: number,
  v: number,
  columns: boolean,
  out: { x: number; y: number },
): void {
  const { at, starts, step } = columns ? shape.columns : shape.rows;
  const count = at.length;
  if (count === 0) {
    out.x = shape.width / 2;
    out.y = shape.height / 2;
    return;
  }
  const line = columns ? v : u;
  const crossing = columns ? u : v;
  const target = Math.min(count - 1, Math.floor((line - Math.floor(line)) * count));
  // The last line whose crossings start at or before the target.
  let low = 0;
  let high = starts.length - 2;
  while (low < high) {
    const middle = (low + high + 1) >> 1;
    if ((starts[middle] ?? 0) <= target) {
      low = middle;
    } else {
      high = middle - 1;
    }
  }
  const first = starts[low] ?? 0;
  const crossings = (starts[low + 1] ?? first) - first;
  const index = first + Math.min(crossings - 1, Math.floor((crossing - Math.floor(crossing)) * crossings));
  const across = (low + 0.5) * step;
  const position = at[index] ?? 0;
  out.x = columns ? across : position;
  out.y = columns ? position : across;
}

/** One channel of a logo's colours at (x, y) between the middles of the cells a, b (below a), c, d (below c). */
function blend(rgb: Float32Array, a: number, b: number, c: number, d: number, x: number, y: number): number {
  const top = (rgb[a] ?? 0) + ((rgb[c] ?? 0) - (rgb[a] ?? 0)) * x;
  const bottom = (rgb[b] ?? 0) + ((rgb[d] ?? 0) - (rgb[b] ?? 0)) * x;
  return top + (bottom - top) * y;
}

/**
 * The logo's colour at (x, y) in its box, in linear light, blended between
 * the middles of the cells round it (as a browser smooths the fallback's
 * grid, public/schools), that of the nearest middle up to the box's edges.
 * False, `out` untouched, for a logo without colours. Allocation-free.
 */
export function logoColor(
  shape: LogoShape,
  x: number,
  y: number,
  out: { red: number; green: number; blue: number },
): boolean {
  const { colors } = shape;
  if (!colors) {
    return false;
  }
  const { cell, columns, rows, rgb } = colors;
  const across = Math.min(columns - 1, Math.max(0, x / cell - 0.5)) || 0;
  const down = Math.min(rows - 1, Math.max(0, y / cell - 0.5)) || 0;
  const left = Math.floor(across);
  const top = Math.floor(down);
  const right = Math.min(columns - 1, left + 1);
  const bottom = Math.min(rows - 1, top + 1);
  const a = (top * columns + left) * 3;
  const b = (bottom * columns + left) * 3;
  const c = (top * columns + right) * 3;
  const d = (bottom * columns + right) * 3;
  out.red = blend(rgb, a, b, c, d, across - left, down - top);
  out.green = blend(rgb, a + 1, b + 1, c + 1, d + 1, across - left, down - top);
  out.blue = blend(rgb, a + 2, b + 2, c + 2, d + 2, across - left, down - top);
  return true;
}

type SchoolLogos = Partial<Record<(typeof SCHOOL_KEYS)[number], Logo>>;

/** The schools' logos once loaded; a school left out of the script has none (docs/adr/0016-logos-des-ecoles.md). */
let logos: SchoolLogos | null = null;
let loading: Promise<void> | null = null;
const shapes: Array<LogoShape | undefined> = [];

/**
 * Loads the schools' logos (school-logos.gen.ts, some 50 KB) the first time
 * they are asked for: the field asks as the waiting list's stage comes near,
 * so that a visit that never gets there never fetches them. Resolves once
 * they are in, or once loading failed, in which case the next call tries again.
 */
export function loadSchoolLogos(): Promise<void> {
  loading ??= import("./school-logos.gen").then(
    (module) => {
      logos = module.SCHOOL_LOGOS;
    },
    () => {
      loading = null;
    },
  );
  return loading;
}

/**
 * The logo of the school `school` (an index into SCHOOL_KEYS), cut into rows
 * and columns the first time it is asked for; none until the logos are loaded
 * (loadSchoolLogos), nor for a school without one: the atoms then orbit.
 */
export function schoolLogoShape(school: number): LogoShape | undefined {
  const key = SCHOOL_KEYS[school];
  const logo = key ? logos?.[key] : undefined;
  if (!logo) {
    return undefined;
  }
  let shape = shapes[school];
  if (!shape) {
    shape = logoShape(logo);
    shapes[school] = shape;
  }
  return shape;
}
