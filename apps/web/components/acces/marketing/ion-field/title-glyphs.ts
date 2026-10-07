import { TITLE_TONES } from "@atomes/three";

/** Points sampled from the glyphs of the hero's title, for the particles to write it (formations.ts). */
export interface TitleGlyphs {
  /** x, y pairs in [0, 1] across the title's box, y down. */
  readonly points: Float32Array;
  /** Tone of each point (`TITLE_TONES`). */
  readonly tones: Uint8Array;
}

/** More points than the largest particle budget: every particle finds its own. */
const SAMPLES = 9000;
/** Pixels drawn to sample from: plenty for 9,000 points, cheap to read back. */
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
 * fall on the visible letters whatever the font's variation axes. Returns
 * null when nothing can be drawn (no canvas, title not laid out).
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
  const filled: number[] = [];
  for (let index = 0; index < width * height; index += 1) {
    if ((pixels[index * 4 + 3] ?? 0) > 140) {
      filled.push(index);
    }
  }
  if (filled.length === 0) {
    return null;
  }

  const next = random(filled.length);
  const count = SAMPLES;
  // Along a Hilbert curve: the particles take evenly spaced points of the list (formations.ts),
  // so the letters fill evenly, and partners take neighbouring points, so their bond stays short.
  let grid = 1;
  while (grid < Math.max(width, height)) {
    grid *= 2;
  }
  const order = (pixel: number) => hilbert(grid, pixel % width, Math.floor(pixel / width));
  const picked = Array.from({ length: count }, () => filled[Math.floor(next() * filled.length)] ?? 0)
    .map((pixel) => ({ pixel, key: order(pixel) }))
    .sort((a, b) => a.key - b.key)
    .map(({ pixel }) => pixel);
  const points = new Float32Array(count * 2);
  const tones = new Uint8Array(count);
  for (let index = 0; index < count; index += 1) {
    const pixel = picked[index] ?? 0;
    const x = pixel % width;
    const y = Math.floor(pixel / width);
    // Anywhere inside the pixel, so points never line up on the sampling grid.
    points[index * 2] = (x + next()) / width;
    points[index * 2 + 1] = (y + next()) / height;
    const red = pixels[pixel * 4] ?? 0;
    const green = pixels[pixel * 4 + 1] ?? 0;
    const tone = red > 127 ? TITLE_TONES.paper : green > 127 ? TITLE_TONES.plasma : TITLE_TONES.volt;
    tones[index] = next() < VOLT_SHARE ? TITLE_TONES.volt : tone;
  }
  return { points, tones };
}
