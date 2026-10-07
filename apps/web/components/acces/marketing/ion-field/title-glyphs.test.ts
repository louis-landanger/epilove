import { describe, expect, it } from "vitest";
import { hilbert, traceOutlines } from "./title-glyphs";

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

describe("traceOutlines", () => {
  const width = 24;
  const height = 14;
  /** A mask: a filled rectangle and a ring (a letter "o"), apart. */
  function mask() {
    const inside = new Uint8Array(width * height);
    const fill = (test: (x: number, y: number) => boolean) => {
      for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
          if (test(x, y)) {
            inside[y * width + x] = 1;
          }
        }
      }
    };
    fill((x, y) => x >= 2 && x <= 9 && y >= 2 && y <= 11);
    fill((x, y) => {
      const distance = Math.hypot(x - 17, y - 7);
      return distance >= 2.5 && distance <= 5.5;
    });
    return inside;
  }
  const neighbours = (a: number, b: number) =>
    Math.max(Math.abs((a % width) - (b % width)), Math.abs(Math.floor(a / width) - Math.floor(b / width))) ===
    1;

  it("traces each outline pixel once, and only those", () => {
    const inside = mask();
    const order = traceOutlines(inside, width, height);
    expect(new Set(order).size).toBe(order.length);
    for (const pixel of order) {
      const x = pixel % width;
      const y = Math.floor(pixel / width);
      expect(inside[pixel]).toBe(1);
      const at = (dx: number, dy: number) => inside[(y + dy) * width + x + dx] === 1;
      expect(at(-1, 0) && at(1, 0) && at(0, -1) && at(0, 1)).toBe(false);
    }
    // The rectangle's outline: 8 × 10 pixels, 32 on its border.
    expect(order.filter((pixel) => pixel % width <= 9).length).toBe(32);
  });

  it("walks along the strokes, pixel to neighbouring pixel", () => {
    const order = traceOutlines(mask(), width, height);
    let starts = 1;
    for (let index = 1; index < order.length; index += 1) {
      if (!neighbours(order[index - 1] ?? 0, order[index] ?? 0)) {
        starts += 1;
      }
    }
    // The rectangle, the ring's outer and inner outlines: a few strokes, not a scatter.
    expect(starts).toBeGreaterThanOrEqual(3);
    expect(starts).toBeLessThanOrEqual(6);
  });
});
