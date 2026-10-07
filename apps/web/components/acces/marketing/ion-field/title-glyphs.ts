import { TITLE_TONES } from "@atomes/three";

/** Points sampled from the glyphs of the hero's title, for the particles to write it (formations.ts). */
export interface TitleGlyphs {
  /** x, y pairs in [0, 1] across the title's box, y down: the outlines first, then the fill. */
  readonly points: Float32Array;
  /** Tone of each point (`TITLE_TONES`). */
  readonly tones: Uint8Array;
  /** How many points, at the start, trace the outlines. */
  readonly outline: number;
}

/** Points along the outlines, evenly spaced: more than the particles that trace them. */
const OUTLINE_SAMPLES = 6000;
/** Points inside the letters. */
const FILL_SAMPLES = 4000;
/** Pixels drawn to sample from: about one per CSS pixel on a desktop, cheap to read back. */
const CANVAS_AREA = 420_000;
/** A few points of every word take the volt accent: sparks in the letters. */
const VOLT_SHARE = 0.05;

const KEYS = { paper: "#ff0000", plasma: "#00ff00", volt: "#0000ff" } as const;
type Tone = keyof typeof KEYS;

/**
 * Position of (x, y) along a Hilbert curve filling a `size` × `size` grid
 * (a power of two): points close on the curve are close on the page.
 */
export function hilbert(size: number, x: number, y: number): number {
  let distance = 0;
  let px = x;
  let py = y;
  for (let half = size / 2; half >= 1; half /= 2) {
    const rx = (px & half) > 0 ? 1 : 0;
    const ry = (py & half) > 0 ? 1 : 0;
    distance += half * half * ((3 * rx) ^ ry);
    // Rotate the quadrant so the curve stays continuous.
    if (ry === 0) {
      if (rx === 1) {
        px = size - 1 - px;
        py = size - 1 - py;
      }
      [px, py] = [py, px];
    }
  }
  return distance;
}

/** The eight neighbours of a pixel, the four sides first: a walk keeps to the outline. */
const NEIGHBOURS = [
  [1, 0],
  [0, 1],
  [-1, 0],
  [0, -1],
  [1, 1],
  [-1, 1],
  [-1, -1],
  [1, -1],
] as const;

/**
 * The pixels on the outlines of a mask (`inside`: 1 for the letters), in the
 * order a pen would trace them: from each outline pixel not yet visited, walk
 * to a neighbouring one until the stroke closes, then start the next. Two
 * consecutive pixels are neighbours, except where a new stroke starts.
 */
export function traceOutlines(inside: Uint8Array, width: number, height: number): Int32Array {
  const isInside = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < width && y < height && inside[y * width + x] === 1;
  const edge = new Uint8Array(width * height);
  let edges = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (
        isInside(x, y) &&
        (!isInside(x - 1, y) || !isInside(x + 1, y) || !isInside(x, y - 1) || !isInside(x, y + 1))
      ) {
        edge[y * width + x] = 1;
        edges += 1;
      }
    }
  }
  const order = new Int32Array(edges);
  let traced = 0;
  for (let start = 0; start < edge.length; start += 1) {
    let current = edge[start] === 1 ? start : -1;
    while (current >= 0) {
      edge[current] = 2;
      order[traced] = current;
      traced += 1;
      const x = current % width;
      const y = Math.floor(current / width);
      current = -1;
      for (const [dx, dy] of NEIGHBOURS) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx >= 0 && ny >= 0 && nx < width && ny < height && edge[ny * width + nx] === 1) {
          current = ny * width + nx;
          break;
        }
      }
    }
  }
  return order;
}

/** Small deterministic generator: the same title always gives the same points. */
function random(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

/**
 * Samples the title as the page draws it. Each run (`[data-tone]`, a word or
 * a punctuation mark that never wraps) is drawn again on a canvas with its
 * own computed font, stretched to the box the browser gave it, so the points
 * fall on the visible letters whatever the font's variation axes. The
 * outlines are sampled evenly along their strokes, the fill at random.
 * Returns null when nothing can be drawn (no canvas, title not laid out).
 */
export function sampleTitle(root: HTMLElement): TitleGlyphs | null {
  const frame = root.getBoundingClientRect();
  if (frame.width < 1 || frame.height < 1) {
    return null;
  }
  const scale = Math.min(1, Math.sqrt(CANVAS_AREA / (frame.width * frame.height)));
  const width = Math.max(1, Math.round(frame.width * scale));
  const height = Math.max(1, Math.round(frame.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) {
    return null;
  }

  for (const run of root.querySelectorAll<HTMLElement>("[data-tone]")) {
    const text = run.textContent?.trim() ?? "";
    const box = run.getBoundingClientRect();
    if (!text || box.width < 1) {
      continue;
    }
    const style = getComputedStyle(run);
    const size = Number.parseFloat(style.fontSize) * scale;
    context.font = `${style.fontStyle} ${style.fontWeight} ${size}px ${style.fontFamily}`;
    const metrics = context.measureText(text);
    const ascent = metrics.fontBoundingBoxAscent;
    const descent = metrics.fontBoundingBoxDescent;
    // An inline box spans the font's ascent and descent: the baseline sits at the ascent.
    const baseline =
      (box.top - frame.top) * scale + (box.height * scale * ascent) / Math.max(1, ascent + descent);
    const stretch = (box.width * scale) / Math.max(1, metrics.width);
    const tone = (run.dataset.tone as Tone | undefined) ?? "paper";
    context.save();
    context.setTransform(stretch, 0, 0, 1, (box.left - frame.left) * scale, baseline);
    context.fillStyle = KEYS[tone] ?? KEYS.paper;
    context.fillText(text, 0, 0);
    context.restore();
  }

  const pixels = context.getImageData(0, 0, width, height).data;
  const inside = new Uint8Array(width * height);
  const filled: number[] = [];
  for (let index = 0; index < width * height; index += 1) {
    if ((pixels[index * 4 + 3] ?? 0) > 140) {
      inside[index] = 1;
      filled.push(index);
    }
  }
  if (filled.length === 0) {
    return null;
  }

  const next = random(filled.length);
  // The outlines, evenly spaced along each stroke: the particles take evenly spaced points
  // of the list (formations.ts), so the atoms are evenly spaced along the letters.
  const strokes = traceOutlines(inside, width, height);
  const outline = strokes.length > 0 ? OUTLINE_SAMPLES : 0;
  const traced = Array.from(
    { length: outline },
    (_, index) => strokes[Math.floor(((index + 0.5) * strokes.length) / outline)] ?? 0,
  );
  // The fill along a Hilbert curve: partners take neighbouring points, so their bond stays short.
  let grid = 1;
  while (grid < Math.max(width, height)) {
    grid *= 2;
  }
  const order = (pixel: number) => hilbert(grid, pixel % width, Math.floor(pixel / width));
  const filling = Array.from({ length: FILL_SAMPLES }, () => filled[Math.floor(next() * filled.length)] ?? 0)
    .map((pixel) => ({ pixel, key: order(pixel) }))
    .sort((a, b) => a.key - b.key)
    .map(({ pixel }) => pixel);

  const picked = [...traced, ...filling];
  const points = new Float32Array(picked.length * 2);
  const tones = new Uint8Array(picked.length);
  picked.forEach((pixel, index) => {
    const x = pixel % width;
    const y = Math.floor(pixel / width);
    // Anywhere inside the pixel, so points never line up on the sampling grid.
    points[index * 2] = (x + next()) / width;
    points[index * 2 + 1] = (y + next()) / height;
    const red = pixels[pixel * 4] ?? 0;
    const green = pixels[pixel * 4 + 1] ?? 0;
    const tone = red > 127 ? TITLE_TONES.paper : green > 127 ? TITLE_TONES.plasma : TITLE_TONES.volt;
    tones[index] = next() < VOLT_SHARE ? TITLE_TONES.volt : tone;
  });
  return { points, tones, outline };
}
