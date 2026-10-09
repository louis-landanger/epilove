import { describe, expect, it } from "vitest";
import { CITY_LAYERS, type CityPlan, cityDots } from "./city";
import { CITY_LOOK, cityDotAlpha, cityFlight } from "./city-painter";

/** A street and a railway crossing it. */
const plan: CityPlan = {
  lines: [
    { layer: CITY_LAYERS.primary, points: Int32Array.from([-1000, 0, 1000, 0]) },
    { layer: CITY_LAYERS.rail, points: Int32Array.from([0, -900, 0, 900]) },
  ],
  areas: [],
};

describe("the plan's dots handed to the ion field", () => {
  it("keeps every dot where, and as, the plan paints it", () => {
    const dots = cityDots(plan);
    const alpha = cityDotAlpha(dots);
    const flight = cityFlight(dots, alpha);
    expect(flight.count).toBe(dots.count);
    expect(flight.place).toHaveLength(dots.count * 3);
    expect(flight.look).toHaveLength(dots.count * 4);
    expect(flight.radius).toHaveLength(dots.count);
    for (let index = 0; index < dots.count; index += 1) {
      expect(flight.place[index * 3]).toBeCloseTo(dots.x[index] ?? Number.NaN, 6);
      expect(flight.place[index * 3 + 1]).toBeCloseTo(dots.y[index] ?? Number.NaN, 6);
      expect(flight.look[index * 4 + 3]).toBeCloseTo(alpha[index] ?? Number.NaN, 6);
      expect(flight.radius[index]).toBeCloseTo(CITY_LOOK[dots.layer[index] ?? 0]?.radius ?? Number.NaN, 6);
    }
  });

  it("gives the dots seeds spread evenly over [0, 1), whatever their order in the plan", () => {
    const flight = cityFlight(cityDots(plan));
    const seeds = Array.from(
      { length: flight.count },
      (_, index) => flight.place[index * 3 + 2] ?? Number.NaN,
    );
    expect(seeds.every((seed) => seed >= 0 && seed < 1)).toBe(true);
    const halves = seeds.filter((seed) => seed < 0.5).length / seeds.length;
    expect(halves).toBeGreaterThan(0.45);
    expect(halves).toBeLessThan(0.55);
  });
});
