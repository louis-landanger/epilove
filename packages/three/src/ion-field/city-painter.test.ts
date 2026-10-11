import { describe, expect, it } from "vitest";
import { CITY_LAYERS, type CityPlan, cityDots } from "./city";
import { CITY_LOOK, CITY_PATCH, cityDotAlpha, cityFlight } from "./city-painter";

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
    expect(flight.place).toHaveLength(dots.count * 2);
    expect(flight.look).toHaveLength(dots.count * 4);
    expect(flight.radius).toHaveLength(dots.count);
    for (let index = 0; index < dots.count; index += 1) {
      expect(flight.place[index * 2]).toBeCloseTo(dots.x[index] ?? Number.NaN, 6);
      expect(flight.place[index * 2 + 1]).toBeCloseTo(dots.y[index] ?? Number.NaN, 6);
      expect(flight.look[index * 4 + 3]).toBeCloseTo(alpha[index] ?? Number.NaN, 6);
      expect(flight.radius[index]).toBeCloseTo(CITY_LOOK[dots.layer[index] ?? 0]?.radius ?? Number.NaN, 6);
    }
  });

  it("gathers the dots into patches of streets, each carried by one of its dots", () => {
    const dots = cityDots(plan);
    const { carrier } = cityFlight(dots);
    const patches = new Set<string>();
    let carriers = 0;
    for (let index = 0; index < dots.count; index += 1) {
      const x = dots.x[index] ?? 0;
      const y = dots.y[index] ?? 0;
      const own = carrier[index * 4 + 2] ?? -1;
      // The carrier is a dot of the same patch…
      expect(Math.floor((carrier[index * 4] ?? 0) / CITY_PATCH)).toBe(Math.floor(x / CITY_PATCH));
      expect(Math.floor((carrier[index * 4 + 1] ?? 0) / CITY_PATCH)).toBe(Math.floor(y / CITY_PATCH));
      expect(carrier[index * 4]).toBeCloseTo(dots.x[own] ?? Number.NaN, 6);
      // …which carries itself.
      expect(carrier[own * 4 + 2]).toBe(own);
      expect(carrier[own * 4 + 3]).toBe(1);
      if (own === index) {
        carriers += 1;
      } else {
        expect(carrier[index * 4 + 3]).toBe(0);
      }
      patches.add(`${Math.floor(x / CITY_PATCH)},${Math.floor(y / CITY_PATCH)}`);
    }
    // One carrier a patch.
    expect(carriers).toBe(patches.size);
    expect(carriers).toBeLessThan(dots.count / 3);
  });
});
