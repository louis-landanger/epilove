import { colors, schoolColors } from "@epilove/tokens";
import { describe, expect, it } from "vitest";
import { linearSrgbToHex, oklchToLinearSrgb, parseOklch, tokenToLinearSrgb } from "./colors";

describe("parseOklch", () => {
  it("reads the token syntax", () => {
    expect(parseOklch("oklch(0.62 0.19 255)")).toEqual({ l: 0.62, c: 0.19, h: 255 });
    expect(parseOklch("oklch(62% 0.19 255deg / 50%)")).toEqual({ l: 0.62, c: 0.19, h: 255 });
  });

  it("refuses anything else", () => {
    expect(() => parseOklch("#ff0000")).toThrow();
    expect(() => parseOklch("oklch(1 2)")).toThrow();
  });
});

describe("oklchToLinearSrgb", () => {
  it("maps the achromatic extremes", () => {
    const white = oklchToLinearSrgb({ l: 1, c: 0, h: 0 });
    white.forEach((channel) => {
      expect(channel).toBeCloseTo(1, 4);
    });
    expect(oklchToLinearSrgb({ l: 0, c: 0, h: 0 })).toEqual([0, 0, 0]);
  });

  it("matches the sRGB primaries", () => {
    expect(linearSrgbToHex(oklchToLinearSrgb({ l: 0.62796, c: 0.25768, h: 29.2339 }))).toBe("#ff0000");
    expect(linearSrgbToHex(oklchToLinearSrgb({ l: 0.86644, c: 0.29483, h: 142.4953 }))).toBe("#00ff00");
    expect(linearSrgbToHex(oklchToLinearSrgb({ l: 0.45201, c: 0.31321, h: 264.052 }))).toBe("#0000ff");
  });

  it("converts the design tokens within the sRGB gamut", () => {
    expect(linearSrgbToHex(tokenToLinearSrgb(colors.ink))).toBe("#0a0a13");
    expect(linearSrgbToHex(tokenToLinearSrgb(colors.plasma))).toBe("#fe38ad");
    for (const token of Object.values(schoolColors)) {
      for (const channel of tokenToLinearSrgb(token)) {
        expect(channel).toBeGreaterThanOrEqual(0);
        expect(channel).toBeLessThanOrEqual(1);
      }
    }
  });
});
