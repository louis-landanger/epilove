import { describe, expect, it } from "vitest";
import { BOND_PERIOD, bondAt, condensed, dropRadii, gapBetween, pairAt, SPILL, SWAY_PERIOD } from "./drops";

// Wide screen: two lines of a very large title.
const wide = { x: 196, y: 150, width: 1361, height: 435 };
// Tablet: two lines, smaller.
const tablet = { x: 42, y: 300, width: 683, height: 218 };
// Phone: four lines, narrow and tall.
const phone = { x: 16, y: 200, width: 358, height: 378 };
const titles = [wide, tablet, phone];

describe("drops of the glass hero", () => {
  it("are large in front of the title but leave it readable, the second smaller than the first", () => {
    for (const title of titles) {
      const [first, second] = dropRadii(title);
      expect(first).toBeLessThan(0.4 * title.height);
      expect(2 * first).toBeLessThanOrEqual(0.4 * title.width);
      expect(second).toBeLessThan(first);
      expect(second).toBeGreaterThan(30);
    }
  });

  it("condense onto the title at the start, overshooting a little", () => {
    expect(condensed(0)).toBe(0);
    const sizes = Array.from({ length: 100 }, (_, step) => condensed(step / 50));
    expect(Math.max(...sizes)).toBeGreaterThan(1.05);
    expect(Math.max(...sizes)).toBeLessThan(1.2);
    expect(condensed(2)).toBeCloseTo(1, 2);
    for (const title of titles) {
      const [first, second] = pairAt(0, title).drops;
      expect(first.radius).toBe(0);
      expect(second.radius).toBe(0);
      const [settled] = pairAt(2.5, title).drops;
      expect(settled.radius).toBeCloseTo(dropRadii(title)[0], 0);
    }
  });

  it("snap together into one drop, then part, every bond", () => {
    // Continuous, from apart to merged and back.
    expect(bondAt(0)).toBe(1);
    expect(bondAt(0.5)).toBe(0);
    expect(bondAt(0.999)).toBeCloseTo(1, 2);
    for (const title of titles) {
      const gaps = Array.from({ length: 220 }, (_, step) =>
        gapBetween(pairAt(BOND_PERIOD + (step / 220) * BOND_PERIOD, title).drops),
      );
      expect(Math.min(...gaps)).toBeLessThan(-0.5 * dropRadii(title)[1]);
      expect(Math.max(...gaps)).toBeGreaterThan(dropRadii(title)[1]);
      // Apart most of the time: they come together briskly.
      expect(gaps.filter((gap) => gap > 0).length).toBeGreaterThan(gaps.length / 2);
    }
  });

  it("stretch the neck between them while they pull apart", () => {
    const together = pairAt(BOND_PERIOD * 1.45, wide).bridge;
    const parting = pairAt(BOND_PERIOD * 1.8, wide).bridge;
    expect(parting).toBeGreaterThan(1.5 * together);
  });

  it("stay in front of the title, within its width, over a whole sway", () => {
    for (const title of titles) {
      for (let step = 0; step < 600; step += 1) {
        for (const drop of pairAt(3 + (step / 600) * 3 * SWAY_PERIOD, title).drops) {
          expect(drop.x - drop.radius).toBeGreaterThan(title.x - 1);
          expect(drop.x + drop.radius).toBeLessThan(title.x + title.width + 1);
          expect(drop.y).toBeGreaterThan(title.y);
          expect(drop.y).toBeLessThan(title.y + title.height);
        }
      }
    }
  });

  it("never cover the copy above or below the title", () => {
    for (const title of titles) {
      for (let step = 0; step < 600; step += 1) {
        for (const drop of pairAt(3 + (step / 600) * 3 * SWAY_PERIOD, title).drops) {
          expect(drop.y - drop.radius).toBeGreaterThanOrEqual(title.y - SPILL * title.height);
          expect(drop.y + drop.radius).toBeLessThanOrEqual(title.y + title.height + SPILL * title.height);
        }
      }
    }
  });

  it("put the first drop on the first line and the second on the last when apart", () => {
    for (const title of titles) {
      const [first, second] = pairAt(BOND_PERIOD, title).drops;
      expect(first.x).toBeLessThan(second.x);
      expect(first.y).toBeLessThan(second.y);
    }
  });

  it("move the same way every time", () => {
    expect(pairAt(3.2, wide)).toEqual(pairAt(3.2, wide));
  });
});
