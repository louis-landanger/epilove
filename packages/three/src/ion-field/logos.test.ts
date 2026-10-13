import { beforeAll, describe, expect, it } from "vitest";
import { createIonFieldLayout, SCHOOL_KEYS } from "./layout";
import {
  type LogoShape,
  loadSchoolLogos,
  logoEdgePoint,
  logoFillPoint,
  logoShape,
  outlineOf,
  schoolLogoShape,
} from "./logos";
import { SCHOOL_LOGOS } from "./school-logos.gen";

const point = { x: 0, y: 0 };

/** Inside the outline by the even-odd rule, at exactly this point. */
function inside(segments: Float32Array, x: number, y: number): boolean {
  let crossings = 0;
  for (let offset = 0; offset < segments.length; offset += 4) {
    const x0 = segments[offset] ?? 0;
    const y0 = segments[offset + 1] ?? 0;
    const x1 = segments[offset + 2] ?? 0;
    const y1 = segments[offset + 3] ?? 0;
    if (y0 <= y !== y1 <= y && x < x0 + ((y - y0) / (y1 - y0)) * (x1 - x0)) {
      crossings += 1;
    }
  }
  return crossings % 2 === 1;
}

/** Distance from a point to the nearest segment of the outline. */
function toOutline(segments: Float32Array, x: number, y: number): number {
  let nearest = Number.POSITIVE_INFINITY;
  for (let offset = 0; offset < segments.length; offset += 4) {
    const ax = segments[offset] ?? 0;
    const ay = segments[offset + 1] ?? 0;
    const bx = segments[offset + 2] ?? 0;
    const by = segments[offset + 3] ?? 0;
    const t = Math.max(
      0,
      Math.min(1, ((x - ax) * (bx - ax) + (y - ay) * (by - ay)) / ((bx - ax) ** 2 + (by - ay) ** 2)),
    );
    nearest = Math.min(nearest, Math.hypot(x - (ax + (bx - ax) * t), y - (ay + (by - ay) * t)));
  }
  return nearest;
}

/** The fill points of the field's first `count` particles, from their formation coordinates. */
function filled(shape: LogoShape, count: number): Array<{ x: number; y: number }> {
  const layout = createIonFieldLayout(count);
  return Array.from({ length: count }, (_, index) => {
    logoFillPoint(shape, layout.lanes[index] ?? 0, layout.along[index] ?? 0, point);
    return { ...point };
  });
}

describe("outlineOf", () => {
  it("cuts a path into its segments: moves, implicit and explicit lines, closes", () => {
    const segments = outlineOf("M0 0 10 0 10 10Z M20 0h5v5H20z m10 0l2 0l0 2");
    expect(segments).toHaveLength(4 * (3 + 4 + 2));
    let length = 0;
    for (let offset = 0; offset < segments.length; offset += 4) {
      length += Math.hypot(
        (segments[offset + 2] ?? 0) - (segments[offset] ?? 0),
        (segments[offset + 3] ?? 0) - (segments[offset + 1] ?? 0),
      );
    }
    expect(length).toBeCloseTo(20 + Math.hypot(10, 10) + 20 + 4, 4);
    // After a close, a relative move starts from where the closed outline began.
    expect([...segments.slice(-8, -4)]).toEqual([30, 0, 32, 0]);
  });

  it("refuses what it cannot draw", () => {
    expect(() => outlineOf("M0 0C5 5 10 5 10 0")).toThrow(SyntaxError);
    expect(() => outlineOf("M0 0Q5 5 10 0")).toThrow(SyntaxError);
    expect(() => outlineOf("M0")).toThrow(SyntaxError);
    expect(() => outlineOf("10 0")).toThrow(SyntaxError);
  });
});

describe("logoShape", () => {
  // A frame: a square with a square hole, filled by the even-odd rule.
  const frame = logoShape({ width: 10, height: 10, path: "M0 0H10V10H0ZM3 3H7V7H3Z" });

  it("fills the ink and never the holes", () => {
    for (const { x, y } of filled(frame, 2000)) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(10);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(10);
      expect(x > 3 && x < 7 && y > 3 && y < 7).toBe(false);
    }
  });

  it("fills it evenly: as many points in each part as it has ink", () => {
    // The frame's left column (x < 3) holds 30 of its 84 square units.
    for (const count of [640, 900, 1600]) {
      const left = filled(frame, count).filter(({ x }) => x < 3).length;
      expect(left / count).toBeCloseTo(30 / 84, 1);
    }
  });

  it("puts the edge points on the outline, each side getting as many as it is long", () => {
    const layout = createIonFieldLayout(1000);
    for (const columns of [false, true]) {
      let outer = 0;
      for (let index = 0; index < layout.count; index += 1) {
        logoEdgePoint(frame, layout.lanes[index] ?? 0, layout.along[index] ?? 0, columns, point);
        expect(toOutline(frame.segments, point.x, point.y)).toBeLessThan(1e-4);
        outer += point.x === 0 || point.x === 10 || point.y === 0 || point.y === 10 ? 1 : 0;
      }
      // The outer square is 40 units round, the hole 16.
      expect(outer / layout.count).toBeCloseTo(40 / 56, 1);
    }
  });

  it("goes down the edges with the first coordinate across the rows, along them with the second", () => {
    let previous = -1;
    for (let index = 0; index < 500; index += 1) {
      logoEdgePoint(frame, index / 500, 0.3, false, point);
      expect(point.y).toBeGreaterThanOrEqual(previous);
      previous = point.y;
    }
    logoEdgePoint(frame, 0.5, 0.1, false, point);
    const left = point.x;
    logoEdgePoint(frame, 0.5, 0.9, false, point);
    expect(point.x).toBeGreaterThan(left);
    // Down the columns, the other way round.
    previous = -1;
    for (let index = 0; index < 500; index += 1) {
      logoEdgePoint(frame, 0.3, index / 500, true, point);
      expect(point.x).toBeGreaterThanOrEqual(previous);
      previous = point.x;
    }
  });

  it("goes down the logo as the first coordinate grows, along each row as the second does", () => {
    let previous = -1;
    for (let index = 0; index <= 100; index += 1) {
      logoFillPoint(frame, index / 101, 0.5, point);
      expect(point.y).toBeGreaterThanOrEqual(previous);
      previous = point.y;
    }
    logoFillPoint(frame, 0.5, 0.1, point);
    const left = point.x;
    logoFillPoint(frame, 0.5, 0.9, point);
    expect(point.x).toBeGreaterThan(left);
  });
});

describe("loadSchoolLogos", () => {
  it("loads the logos the first time they are asked for: none until then", async () => {
    expect(schoolLogoShape(0)).toBeUndefined();
    const first = loadSchoolLogos();
    expect(loadSchoolLogos()).toBe(first);
    await first;
    expect(schoolLogoShape(0)?.width).toBe(SCHOOL_LOGOS.epita.width);
  });
});

describe("the schools' logos", () => {
  beforeAll(() => loadSchoolLogos());

  it("has every school's logo, its outline inside its box", () => {
    for (const [school, key] of SCHOOL_KEYS.entries()) {
      const logo = SCHOOL_LOGOS[key];
      expect(Math.max(logo.width, logo.height)).toBe(100);
      const shape = schoolLogoShape(school);
      expect(shape?.width).toBe(logo.width);
      const segments = shape?.segments ?? new Float32Array();
      expect(segments.length).toBeGreaterThan(400);
      // The outline is kept in single precision.
      for (let offset = 0; offset < segments.length; offset += 2) {
        expect(segments[offset]).toBeGreaterThanOrEqual(0);
        expect(segments[offset]).toBeLessThanOrEqual(Math.fround(logo.width));
        expect(segments[offset + 1]).toBeGreaterThanOrEqual(0);
        expect(segments[offset + 1]).toBeLessThanOrEqual(Math.fround(logo.height));
      }
    }
    expect(schoolLogoShape(-1)).toBeUndefined();
    expect(schoolLogoShape(SCHOOL_KEYS.length)).toBeUndefined();
  });

  it("puts every fill point in the ink, or within a hair of its edge", () => {
    for (const [school, key] of SCHOOL_KEYS.entries()) {
      const shape = schoolLogoShape(school) as LogoShape;
      const astray = filled(shape, 1600)
        .filter(({ x, y }) => !inside(shape.segments, x, y) && toOutline(shape.segments, x, y) > 0.15)
        .map(({ x, y }) => `${key} (${x.toFixed(2)}, ${y.toFixed(2)})`);
      expect(astray.slice(0, 5)).toEqual([]);
    }
  });

  it("spreads the fill evenly over each logo, as many points in each quarter as it has ink", () => {
    for (const school of SCHOOL_KEYS.keys()) {
      const shape = schoolLogoShape(school) as LogoShape;
      // The ink of each quarter, counted on a fine grid.
      const ink = [0, 0, 0, 0];
      for (let gy = 0; gy < 200; gy += 1) {
        for (let gx = 0; gx < 200; gx += 1) {
          const x = ((gx + 0.5) / 200) * shape.width;
          const y = ((gy + 0.5) / 200) * shape.height;
          if (inside(shape.segments, x, y)) {
            const quarter = (x < shape.width / 2 ? 0 : 1) + (y < shape.height / 2 ? 0 : 2);
            ink[quarter] = (ink[quarter] ?? 0) + 1;
          }
        }
      }
      const total = ink.reduce((sum, value) => sum + value, 0);
      const points = filled(shape, 900);
      for (const [quarter, share] of ink.entries()) {
        const mine = points.filter(
          ({ x, y }) => (x < shape.width / 2 ? 0 : 1) + (y < shape.height / 2 ? 0 : 2) === quarter,
        ).length;
        expect(Math.abs(mine / points.length - share / total)).toBeLessThan(0.025);
      }
    }
  });
});
