import { describe, expect, it } from "vitest";
import { noteFor, PENTATONIC } from "./notes";

describe("landing sound notes", () => {
  it("wraps any step onto the pentatonic scale", () => {
    expect(noteFor(0)).toBe(440);
    expect(noteFor(PENTATONIC.length)).toBe(440);
    expect(noteFor(-1)).toBe(PENTATONIC.at(-1));
    for (let step = -20; step < 20; step += 1) {
      expect(PENTATONIC).toContain(noteFor(step));
    }
  });
});
