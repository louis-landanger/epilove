import { describe, expect, it } from "vitest";
import { bondOf, bondPath, coverPoint, SCENES } from "./scenes";

describe("scenes of the people hero", () => {
  it("places a point of a photograph where object-fit: cover shows it", () => {
    const photo = { width: 2400, height: 1600, focus: [0.5, 0.5] as const };
    // Wide screen: the photograph spans the width, its top and bottom are cropped.
    expect(coverPoint([0.5, 0.5], photo, { width: 1800, height: 600 })).toEqual({ x: 900, y: 300 });
    expect(coverPoint([0, 0], photo, { width: 1800, height: 600 })).toEqual({ x: 0, y: -300 });
    // Portrait screen: it spans the height, its sides are cropped around the focus.
    const left = { ...photo, focus: [0, 0.5] as const };
    expect(coverPoint([0, 0.25], left, { width: 400, height: 800 })).toEqual({ x: 0, y: 200 });
    expect(coverPoint([1, 1], photo, { width: 400, height: 800 })).toEqual({ x: 800, y: 800 });
  });

  it("keeps both people of each bond in view, clear of the edges, on phones and wide screens", () => {
    for (const screen of [
      { width: 390, height: 844 },
      { width: 360, height: 640 },
      { width: 1753, height: 767 },
      { width: 1280, height: 800 },
    ]) {
      for (const scene of SCENES) {
        for (const point of bondOf(scene, screen)) {
          const { x, y } = coverPoint(point, scene, screen);
          expect(x, `${scene.key} ${screen.width}`).toBeGreaterThan(40);
          expect(x, `${scene.key} ${screen.width}`).toBeLessThan(screen.width - 40);
          expect(y, `${scene.key} ${screen.width}`).toBeGreaterThan(0.3 * screen.height);
          expect(y, `${scene.key} ${screen.width}`).toBeLessThan(0.8 * screen.height);
        }
      }
    }
  });

  it("draws the bond as an arc rising above both people", () => {
    expect(bondPath({ x: 100, y: 200 }, { x: 300, y: 200 })).toBe("M100 200 Q200 160 300 200");
    // Close together, the arc still rises a little.
    expect(bondPath({ x: 100, y: 200 }, { x: 110, y: 200 })).toBe("M100 200 Q105 176 110 200");
  });
});
