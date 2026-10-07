import { describe, expect, it } from "vitest";
import { hilbert } from "./title-glyphs";

describe("hilbert", () => {
  it("visits every cell once, each step to a neighbouring cell", () => {
    const size = 32;
    const cells: Array<[number, number]> = [];
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        cells[hilbert(size, x, y)] = [x, y];
      }
    }
    expect(cells.filter(Boolean)).toHaveLength(size * size);
    for (let index = 1; index < cells.length; index += 1) {
      const [ax, ay] = cells[index - 1] ?? [0, 0];
      const [bx, by] = cells[index] ?? [0, 0];
      expect(Math.abs(ax - bx) + Math.abs(ay - by)).toBe(1);
    }
  });
});
