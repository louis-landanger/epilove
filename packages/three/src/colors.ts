/**
 * OKLCH helpers. The design tokens are written in OKLCH (docs/02-design.md);
 * WebGL/WebGPU shaders work in linear sRGB, so the scenes convert them here.
 */

export type LinearRgb = readonly [r: number, g: number, b: number];

const OKLCH_PATTERN = /^oklch\(\s*([\d.]+)(%?)\s+([\d.]+)\s+([\d.]+)(?:deg)?\s*(?:\/\s*[\d.]+%?\s*)?\)$/i;

export interface Oklch {
  readonly l: number;
  readonly c: number;
  readonly h: number;
}

/** Parses `oklch(L C H)` as written in the tokens (L as a number or a percentage, H in degrees). */
export function parseOklch(value: string): Oklch {
  const match = OKLCH_PATTERN.exec(value.trim());
  if (!match) {
    throw new Error(`Not an oklch() colour: ${value}`);
  }
  const lightness = Number(match[1]);
  return {
    l: match[2] === "%" ? lightness / 100 : lightness,
    c: Number(match[3]),
    h: Number(match[4]),
  };
}

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

/** OKLCH to linear sRGB (Björn Ottosson's OKLab matrices), clipped to the sRGB gamut. */
export function oklchToLinearSrgb({ l, c, h }: Oklch): LinearRgb {
  const hue = (h * Math.PI) / 180;
  const a = c * Math.cos(hue);
  const b = c * Math.sin(hue);

  const lPrime = l + 0.3963377774 * a + 0.2158037573 * b;
  const mPrime = l - 0.1055613458 * a - 0.0638541728 * b;
  const sPrime = l - 0.0894841775 * a - 1.291485548 * b;

  const lms = [lPrime ** 3, mPrime ** 3, sPrime ** 3] as const;

  return [
    clamp01(4.0767416621 * lms[0] - 3.3077115913 * lms[1] + 0.2309699292 * lms[2]),
    clamp01(-1.2684380046 * lms[0] + 2.6097574011 * lms[1] - 0.3413193965 * lms[2]),
    clamp01(-0.0041960863 * lms[0] - 0.7034186147 * lms[1] + 1.707614701 * lms[2]),
  ];
}

/** Linear sRGB to an `#rrggbb` string (gamma-encoded), for canvases and fallbacks. */
export function linearSrgbToHex(rgb: LinearRgb): string {
  return `#${rgb
    .map((channel) => {
      const encoded = channel <= 0.0031308 ? 12.92 * channel : 1.055 * channel ** (1 / 2.4) - 0.055;
      return Math.round(clamp01(encoded) * 255)
        .toString(16)
        .padStart(2, "0");
    })
    .join("")}`;
}

export function tokenToLinearSrgb(token: string): LinearRgb {
  return oklchToLinearSrgb(parseOklch(token));
}
