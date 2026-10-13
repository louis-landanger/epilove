import { schoolGlyphs } from "@atomes/tokens";
import { describe, expect, it } from "vitest";
import { GLYPH_BOX, glyphPoint, glyphStrokes, SCHOOL_GLYPH_STROKES } from "./glyphs";
import { SCHOOL_KEYS } from "./layout";

const point = { x: 0, y: 0 };

/** Points every 1/n of the strokes' length. */
function along(strokes: ReturnType<typeof glyphStrokes>, n: number): Array<{ x: number; y: number }> {
  return Array.from({ length: n }, (_, index) => {
    glyphPoint(strokes, index / n, point);
    return { ...point };
  });
}

/** Distance from a point to the segment from a to b. */
function toSegment(p: { x: number; y: number }, a: [number, number], b: [number, number]): number {
  const [ax, ay] = a;
  const [bx, by] = b;
  const t = Math.max(
    0,
    Math.min(1, ((p.x - ax) * (bx - ax) + (p.y - ay) * (by - ay)) / ((bx - ax) ** 2 + (by - ay) ** 2)),
  );
  return Math.hypot(p.x - (ax + (bx - ax) * t), p.y - (ay + (by - ay) * t));
}

describe("glyphStrokes", () => {
  it("cuts a path of lines into its segments, moves left out", () => {
    // EPITA's brackets: two chevrons, each of two segments.
    const strokes = glyphStrokes("M8 4 3 10l5 6M12 4l5 6-5 6");
    expect(strokes.ends).toHaveLength(4);
    expect(strokes.length).toBeCloseTo(4 * Math.hypot(5, 6), 4);
    const chevrons: Array<[[number, number], [number, number]]> = [
      [
        [8, 4],
        [3, 10],
      ],
      [
        [3, 10],
        [8, 16],
      ],
      [
        [12, 4],
        [17, 10],
      ],
      [
        [17, 10],
        [12, 16],
      ],
    ];
    for (const p of along(strokes, 400)) {
      expect(Math.min(...chevrons.map(([a, b]) => toSegment(p, a, b)))).toBeLessThan(1e-4);
    }
  });

  it("closes a shape, with horizontal and vertical lines", () => {
    // Sup'Biotech's hexagon.
    const strokes = glyphStrokes(schoolGlyphs.supbiotech);
    const side = Math.hypot(6.5, 3.75);
    expect(strokes.length).toBeCloseTo(4 * side + 2 * 7.5, 4);
    glyphPoint(strokes, 0, point);
    expect(point).toEqual({ x: 10, y: 2.5 });
  });

  it("draws arcs round their centre: ISG's two rings", () => {
    const strokes = glyphStrokes(schoolGlyphs.isg);
    expect(strokes.length).toBeCloseTo(2 * Math.PI * (3 + 6.5), 1);
    for (const p of along(strokes, 600)) {
      const radius = Math.hypot(p.x - 10, p.y - 10);
      expect(Math.min(Math.abs(radius - 3), Math.abs(radius - 6.5))).toBeLessThan(0.01);
    }
  });

  it("follows Bézier curves through their end points: IPSA's star", () => {
    const strokes = glyphStrokes(schoolGlyphs.ipsa);
    const points = along(strokes, 2000);
    for (const tip of [
      { x: 10, y: 2 },
      { x: 18, y: 10 },
      { x: 10, y: 18 },
      { x: 2, y: 10 },
    ]) {
      expect(Math.min(...points.map((p) => Math.hypot(p.x - tip.x, p.y - tip.y)))).toBeLessThan(0.05);
    }
    // Its sides curve in towards the centre: no point beyond the tips.
    for (const p of points) {
      expect(Math.abs(p.x - 10) + Math.abs(p.y - 10)).toBeLessThanOrEqual(8.0001);
    }
  });

  it("spreads evenly spaced fractions evenly along the strokes", () => {
    const strokes = glyphStrokes("M0 0h10v10");
    glyphPoint(strokes, 0.25, point);
    expect(point.x).toBeCloseTo(5, 5);
    expect(point.y).toBeCloseTo(0, 5);
    glyphPoint(strokes, 0.75, point);
    expect(point.x).toBeCloseTo(10, 5);
    expect(point.y).toBeCloseTo(5, 5);
    // It wraps round.
    glyphPoint(strokes, 1.25, point);
    expect(point.x).toBeCloseTo(5, 5);
  });

  it("refuses what it cannot draw", () => {
    expect(() => glyphStrokes("M0 0Q5 5 10 0")).toThrow(SyntaxError);
    expect(() => glyphStrokes("M0")).toThrow(SyntaxError);
  });
});

describe("SCHOOL_GLYPH_STROKES", () => {
  it("has the strokes of every school's glyph, inside its box", () => {
    expect(SCHOOL_GLYPH_STROKES).toHaveLength(SCHOOL_KEYS.length);
    for (const strokes of SCHOOL_GLYPH_STROKES) {
      expect(strokes.length).toBeGreaterThan(20);
      for (const p of along(strokes, 300)) {
        expect(p.x).toBeGreaterThanOrEqual(0);
        expect(p.x).toBeLessThanOrEqual(GLYPH_BOX);
        expect(p.y).toBeGreaterThanOrEqual(0);
        expect(p.y).toBeLessThanOrEqual(GLYPH_BOX);
      }
    }
  });
});
