import { describe, expect, it } from "vitest";
import {
  CAMPUS_FAMILIES,
  place,
  reactionScore,
  SYMBOLS,
  TABLE_COLUMNS,
  TABLE_ROWS,
  verdictFor,
} from "./elements";

describe("periodic table", () => {
  it("lists the 118 elements", () => {
    expect(SYMBOLS).toHaveLength(118);
    expect(SYMBOLS[19]).toBe("Ca");
    expect(SYMBOLS[84]).toBe("At");
    expect(SYMBOLS[117]).toBe("Og");
  });

  it("gives every element its own cell, in the usual places", () => {
    const cells = new Set<string>();
    for (let z = 1; z <= 118; z += 1) {
      const [row, column] = place(z);
      expect(row).toBeGreaterThanOrEqual(1);
      expect(row).toBeLessThanOrEqual(TABLE_ROWS);
      expect(row).not.toBe(8);
      expect(column).toBeGreaterThanOrEqual(1);
      expect(column).toBeLessThanOrEqual(TABLE_COLUMNS);
      cells.add(`${row}/${column}`);
    }
    expect(cells.size).toBe(118);
    // Calcium and astatine; lanthanum opens the lanthanides, under the gap.
    expect(place(20)).toEqual([4, 2]);
    expect(place(85)).toEqual([6, 17]);
    expect(place(57)).toEqual([9, 3]);
    // The top of the table is empty between hydrogen and helium, boron and beryllium: the title's place.
    for (const z of [1, 2, 3, 4, 5, 11, 12, 13]) {
      const [row, column] = place(z);
      expect(row <= 3 && column >= 3 && column <= 12).toBe(false);
    }
  });

  it("only gives campus meanings to real elements", () => {
    for (const z of Object.keys(CAMPUS_FAMILIES).map(Number)) {
      expect(z).toBeGreaterThanOrEqual(1);
      expect(z).toBeLessThanOrEqual(118);
    }
  });

  it("scores a reaction the same way whatever the order, between 72 and 98 %", () => {
    expect(reactionScore(20, 75)).toBe(reactionScore(75, 20));
    for (let a = 1; a <= 118; a += 7) {
      for (let b = 2; b <= 118; b += 11) {
        const score = reactionScore(a, b);
        expect(score).toBeGreaterThanOrEqual(72);
        expect(score).toBeLessThanOrEqual(98);
      }
    }
  });

  it("gives a verdict for every score", () => {
    expect(verdictFor(98)).toBe(0);
    expect(verdictFor(90)).toBe(1);
    expect(verdictFor(80)).toBe(2);
    expect(verdictFor(72)).toBe(3);
  });
});
