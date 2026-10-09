import { describe, expect, it } from "vitest";
import {
  CITY_DOT_SPACING,
  CITY_GREEN_STEP,
  CITY_LAYERS,
  type CityPlan,
  cityDots,
  decodeCityPlan,
  encodeCityPlan,
} from "./city";
import { CAMPUS } from "./rivers";

/** A street 2 km long, a railway crossing it, and a park far from both. */
const plan: CityPlan = {
  lines: [
    { layer: CITY_LAYERS.primary, points: Int32Array.from([-1000, 0, 0, 0, 1000, 0]) },
    { layer: CITY_LAYERS.rail, points: Int32Array.from([0, -900, 0, 900]) },
    { layer: CITY_LAYERS.minor, points: Int32Array.from([-6000, -6000, 6000, 6000]) },
  ],
  areas: [Int32Array.from([2000, 2000, 2400, 2000, 2400, 2400, 2000, 2400])],
};

describe("the city plan's encoding", () => {
  it("reads back exactly what it wrote, negative coordinates included", () => {
    const decoded = decodeCityPlan(encodeCityPlan(plan));
    expect(decoded.lines.map((line) => line.layer)).toEqual(plan.lines.map((line) => line.layer));
    decoded.lines.forEach((line, index) => {
      expect([...line.points]).toEqual([...(plan.lines[index]?.points ?? [])]);
    });
    expect(decoded.areas.map((area) => [...area])).toEqual(plan.areas.map((area) => [...area]));
  });

  it("rounds the points to the grid it was written on", () => {
    const decoded = decodeCityPlan(encodeCityPlan(plan, 4));
    expect([...(decoded.lines[0]?.points ?? [])]).toEqual([-1000, 0, 0, 0, 1000, 0]);
    const odd = decodeCityPlan(
      encodeCityPlan(
        { lines: [{ layer: CITY_LAYERS.minor, points: Int32Array.from([5, -7]) }], areas: [] },
        4,
      ),
    );
    expect([...(odd.lines[0]?.points ?? [])]).toEqual([4, -8]);
  });

  it("keeps it small: a point a few metres from the last costs two bytes", () => {
    const steps = Int32Array.from({ length: 2000 }, (_, index) => index * 30);
    const bytes = encodeCityPlan({ lines: [{ layer: CITY_LAYERS.minor, points: steps }], areas: [] });
    expect(bytes.length).toBeLessThan(2000 + 16);
  });

  it("refuses anything else", () => {
    expect(() => decodeCityPlan(new TextEncoder().encode("<!doctype html>"))).toThrow();
    expect(() => decodeCityPlan(encodeCityPlan(plan).slice(0, 12))).toThrow();
  });
});

describe("the city's dots", () => {
  const dots = cityDots(plan);
  const ofLayer = (layer: number) =>
    Array.from({ length: dots.count }, (_, index) => index).filter((index) => dots.layer[index] === layer);

  it("strings a dot every few tens of metres along each line, close to it", () => {
    const street = ofLayer(CITY_LAYERS.primary);
    const spacing = CITY_DOT_SPACING[CITY_LAYERS.primary] ?? 0;
    expect(street.length).toBeGreaterThan((2000 / spacing) * 0.85);
    expect(street.length).toBeLessThan((2000 / spacing) * 1.2);
    for (const index of street) {
      expect(Math.abs(dots.y[index] ?? 1)).toBeLessThanOrEqual(0.0016);
      expect(Math.abs(dots.x[index] ?? 2)).toBeLessThanOrEqual(1.0016);
    }
    // The railway is sparser than the street.
    expect(ofLayer(CITY_LAYERS.rail).length).toBeLessThan(street.length);
  });

  it("stipples the green areas inside their outline, about one dot per square of the grid", () => {
    const green = ofLayer(CITY_LAYERS.green);
    const squares = (400 / CITY_GREEN_STEP) ** 2;
    expect(green.length).toBeGreaterThan(squares * 0.5);
    expect(green.length).toBeLessThanOrEqual(squares + 20);
    for (const index of green) {
      expect(dots.x[index]).toBeGreaterThanOrEqual(2);
      expect(dots.x[index]).toBeLessThanOrEqual(2.4);
      expect(dots.y[index]).toBeGreaterThanOrEqual(2);
      expect(dots.y[index]).toBeLessThanOrEqual(2.4);
    }
  });

  it("lights the city up from the campus outwards", () => {
    const [campusX, campusY] = CAMPUS;
    const distance = (index: number) =>
      Math.hypot((dots.x[index] ?? 0) - campusX, (dots.y[index] ?? 0) - campusY);
    const indices = Array.from({ length: dots.count }, (_, index) => index).sort(
      (a, b) => distance(a) - distance(b),
    );
    const nearest = indices.slice(0, 20).map((index) => dots.order[index] ?? 1);
    const farthest = indices.slice(-20).map((index) => dots.order[index] ?? 0);
    expect(Math.max(...nearest)).toBeLessThan(Math.min(...farthest));
    for (let index = 0; index < dots.count; index += 1) {
      expect(dots.order[index]).toBeGreaterThanOrEqual(0);
      expect(dots.order[index]).toBeLessThanOrEqual(1);
    }
  });

  it("fades out towards the plan's edge, with no hard border", () => {
    const diagonal = ofLayer(CITY_LAYERS.minor);
    const atEdge = diagonal.filter((index) => Math.abs(dots.x[index] ?? 0) > 5.95);
    const inside = diagonal.filter((index) => Math.abs(dots.x[index] ?? 0) < 4);
    expect(atEdge.length).toBeGreaterThan(0);
    expect(Math.max(...atEdge.map((index) => dots.light[index] ?? 1))).toBeLessThan(0.05);
    expect(Math.min(...inside.map((index) => dots.light[index] ?? 0))).toBeGreaterThanOrEqual(0.75);
  });

  it("draws the same plan on every device", () => {
    const again = cityDots(plan);
    expect(again.count).toBe(dots.count);
    expect([...again.x]).toEqual([...dots.x]);
    expect([...again.order]).toEqual([...dots.order]);
  });
});
