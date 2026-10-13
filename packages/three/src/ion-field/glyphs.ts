import { schoolGlyphs } from "@atomes/tokens";
import { SCHOOL_KEYS } from "./layout";

/**
 * The schools' glyphs (`schoolGlyphs` in the design tokens: our own sign of
 * each "element family" of Atomes, never a school logo) as strokes the
 * particles can trace: each glyph's SVG path, in its box of GLYPH_BOX units
 * (y down), cut into short straight segments, with the length of the strokes
 * up to the end of each, so that evenly spread fractions of the length give
 * evenly spaced points.
 */
export interface GlyphStrokes {
  /** x0, y0, x1, y1 of each segment, in the glyph's box. */
  readonly segments: Float32Array;
  /** Length of the strokes from their start to the end of each segment. */
  readonly ends: Float32Array;
  /** Length of all the strokes. */
  readonly length: number;
}

/** Side of the box the glyphs are drawn in, in SVG units. */
export const GLYPH_BOX = 20;

/** Straight segments per Bézier curve, and per radian of an arc. */
const CURVE_STEPS = 24;
const ARC_STEPS_PER_RADIAN = 12;

// Any letter is a command, so that one it cannot draw is refused rather than skipped.
const TOKEN = /[A-Za-z]|[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g;
const COMMAND = /^[A-Za-z]$/;

/**
 * Cuts an SVG path into straight segments: moves, lines (L, H, V), cubic
 * Bézier curves (C), elliptical arcs (A) and closes (Z), absolute or
 * relative, with repeated arguments. Throws on anything else.
 */
export function glyphStrokes(path: string): GlyphStrokes {
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
      throw new SyntaxError(`Expected a number in the glyph path "${path}"`);
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
      throw new SyntaxError(`Unexpected number in the glyph path "${path}"`);
    }
    const relative = command === command.toLowerCase();
    const baseX = relative ? x : 0;
    const baseY = relative ? y : 0;
    switch (command.toUpperCase()) {
      case "M": {
        x = startX = baseX + read();
        y = startY = baseY + read();
        // More pairs after a move are lines.
        command = relative ? "l" : "L";
        break;
      }
      case "L":
        lineTo(baseX + read(), baseY + read());
        break;
      case "H":
        lineTo(baseX + read(), y);
        break;
      case "V":
        lineTo(x, baseY + read());
        break;
      case "C": {
        const x1 = baseX + read();
        const y1 = baseY + read();
        const x2 = baseX + read();
        const y2 = baseY + read();
        const x3 = baseX + read();
        const y3 = baseY + read();
        const x0 = x;
        const y0 = y;
        for (let step = 1; step <= CURVE_STEPS; step += 1) {
          const t = step / CURVE_STEPS;
          const u = 1 - t;
          lineTo(
            u * u * u * x0 + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * x3,
            u * u * u * y0 + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y3,
          );
        }
        // Land exactly on the end point, whatever the rounding.
        x = x3;
        y = y3;
        break;
      }
      case "A": {
        const rx = read();
        const ry = read();
        const rotation = read();
        const largeArc = read() !== 0;
        const sweep = read() !== 0;
        const toX = baseX + read();
        const toY = baseY + read();
        arcTo(x, y, rx, ry, rotation, largeArc, sweep, toX, toY, lineTo);
        x = toX;
        y = toY;
        break;
      }
      case "Z":
        lineTo(startX, startY);
        break;
      default:
        throw new SyntaxError(`Unsupported command "${command}" in the glyph path "${path}"`);
    }
  }

  const ends = new Float32Array(segments.length / 4);
  let length = 0;
  for (let segment = 0; segment < ends.length; segment += 1) {
    const offset = segment * 4;
    length += Math.hypot(
      (segments[offset + 2] ?? 0) - (segments[offset] ?? 0),
      (segments[offset + 3] ?? 0) - (segments[offset + 1] ?? 0),
    );
    ends[segment] = length;
  }
  return { segments: Float32Array.from(segments), ends, length };
}

/** An elliptical arc as straight segments (SVG 1.1, appendix F.6.5: from end points to centre). */
function arcTo(
  fromX: number,
  fromY: number,
  radiusX: number,
  radiusY: number,
  rotation: number,
  largeArc: boolean,
  sweep: boolean,
  toX: number,
  toY: number,
  lineTo: (x: number, y: number) => void,
): void {
  let rx = Math.abs(radiusX);
  let ry = Math.abs(radiusY);
  if (rx === 0 || ry === 0 || (fromX === toX && fromY === toY)) {
    lineTo(toX, toY);
    return;
  }
  const phi = (rotation * Math.PI) / 180;
  const cos = Math.cos(phi);
  const sin = Math.sin(phi);
  const halfX = (fromX - toX) / 2;
  const halfY = (fromY - toY) / 2;
  const x1 = cos * halfX + sin * halfY;
  const y1 = -sin * halfX + cos * halfY;
  // Radii too small for the end points grow until they reach.
  const excess = (x1 * x1) / (rx * rx) + (y1 * y1) / (ry * ry);
  if (excess > 1) {
    rx *= Math.sqrt(excess);
    ry *= Math.sqrt(excess);
  }
  const numerator = rx * rx * ry * ry - rx * rx * y1 * y1 - ry * ry * x1 * x1;
  const denominator = rx * rx * y1 * y1 + ry * ry * x1 * x1;
  const root = (largeArc === sweep ? -1 : 1) * Math.sqrt(Math.max(0, numerator / denominator));
  const cx1 = (root * rx * y1) / ry;
  const cy1 = (-root * ry * x1) / rx;
  const cx = cos * cx1 - sin * cy1 + (fromX + toX) / 2;
  const cy = sin * cx1 + cos * cy1 + (fromY + toY) / 2;
  const angle = (ux: number, uy: number, vx: number, vy: number) =>
    Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
  const start = angle(1, 0, (x1 - cx1) / rx, (y1 - cy1) / ry);
  let turn = angle((x1 - cx1) / rx, (y1 - cy1) / ry, (-x1 - cx1) / rx, (-y1 - cy1) / ry);
  if (!sweep && turn > 0) {
    turn -= 2 * Math.PI;
  } else if (sweep && turn < 0) {
    turn += 2 * Math.PI;
  }
  const steps = Math.max(2, Math.ceil(Math.abs(turn) * ARC_STEPS_PER_RADIAN));
  for (let step = 1; step < steps; step += 1) {
    const theta = start + (turn * step) / steps;
    const ex = rx * Math.cos(theta);
    const ey = ry * Math.sin(theta);
    lineTo(cx + cos * ex - sin * ey, cy + sin * ex + cos * ey);
  }
  lineTo(toX, toY);
}

/**
 * Point at the fraction `s` of the strokes' length (wrapping round), in the
 * glyph's box. Allocation-free: it runs for thousands of particles every frame.
 */
export function glyphPoint(strokes: GlyphStrokes, s: number, out: { x: number; y: number }): void {
  const { segments, ends, length } = strokes;
  const count = ends.length;
  if (count === 0) {
    out.x = GLYPH_BOX / 2;
    out.y = GLYPH_BOX / 2;
    return;
  }
  const distance = (s - Math.floor(s)) * length;
  // The first segment that ends at or past the distance.
  let low = 0;
  let high = count - 1;
  while (low < high) {
    const middle = (low + high) >> 1;
    if ((ends[middle] ?? 0) < distance) {
      low = middle + 1;
    } else {
      high = middle;
    }
  }
  const offset = low * 4;
  const end = ends[low] ?? 0;
  const begin = low > 0 ? (ends[low - 1] ?? 0) : 0;
  const t = end > begin ? (distance - begin) / (end - begin) : 0;
  const x0 = segments[offset] ?? 0;
  const y0 = segments[offset + 1] ?? 0;
  out.x = x0 + ((segments[offset + 2] ?? 0) - x0) * t;
  out.y = y0 + ((segments[offset + 3] ?? 0) - y0) * t;
}

/** The strokes of each school's glyph, in `SCHOOL_KEYS` order. */
export const SCHOOL_GLYPH_STROKES: readonly GlyphStrokes[] = SCHOOL_KEYS.map((school) =>
  glyphStrokes(schoolGlyphs[school]),
);
