import { describe, expect, it } from "vitest";
import { PEOPLE } from "../match/people";
import { chemistryWith, flightOf, HAND, outcomeOf, THROW_DISTANCE, THROW_SPEED, velocityOf } from "./hand";

const still = { vx: 0, vy: 0 };

describe("hand of holographic cards", () => {
  it("holds one fictional student per school", () => {
    expect(new Set(HAND.map((person) => PEOPLE[person].school)).size).toBe(5);
  });

  it("reads the pointer's velocity over its last moves", () => {
    expect(velocityOf([])).toEqual({ vx: 0, vy: 0 });
    expect(velocityOf([{ x: 10, y: 10, t: 0 }])).toEqual({ vx: 0, vy: 0 });
    // Only the last 100 ms count: an early pause does not slow the throw down.
    const samples = [
      { x: 0, y: 0, t: 0 },
      { x: 0, y: 0, t: 400 },
      { x: 50, y: -10, t: 450 },
      { x: 100, y: -20, t: 500 },
    ];
    expect(velocityOf(samples)).toEqual({ vx: 1, vy: -0.2 });
  });

  it("likes a card thrown or dragged to the right or upwards, passes one to the left", () => {
    expect(outcomeOf({ dx: 40, dy: 0 }, { vx: 1, vy: 0 })).toBe("like");
    expect(outcomeOf({ dx: THROW_DISTANCE + 1, dy: 0 }, still)).toBe("like");
    expect(outcomeOf({ dx: 0, dy: -40 }, { vx: 0.1, vy: -1 })).toBe("like");
    expect(outcomeOf({ dx: -40, dy: 0 }, { vx: -1, vy: 0 })).toBe("pass");
    expect(outcomeOf({ dx: -THROW_DISTANCE - 1, dy: -10 }, still)).toBe("pass");
    // The throw decides, not the drag: dragged left, then flung right.
    expect(outcomeOf({ dx: -60, dy: 0 }, { vx: 1.2, vy: 0 })).toBe("like");
  });

  it("puts a card back when it was neither far nor fast enough, or pulled down", () => {
    expect(outcomeOf({ dx: 30, dy: 0 }, { vx: THROW_SPEED / 2, vy: 0 })).toBe("back");
    expect(outcomeOf({ dx: 0, dy: 200 }, still)).toBe("back");
    expect(outcomeOf({ dx: 10, dy: 60 }, { vx: 0.1, vy: 1 })).toBe("back");
  });

  it("sends a card off briskly, to the upper right when liked with a click or a key", () => {
    const clicked = flightOf("like", still);
    expect(clicked.vx).toBeGreaterThan(1);
    expect(clicked.vy).toBeLessThan(0);
    expect(flightOf("pass", still).vx).toBeLessThan(-1);
    // A slow throw is sped up in its own direction; a fast one keeps its speed.
    const slow = flightOf("like", { vx: 0.6, vy: -0.2 });
    expect(slow.vx / slow.vy).toBeCloseTo(0.6 / -0.2);
    expect(Math.hypot(slow.vx, slow.vy)).toBeCloseTo(1.6);
    expect(flightOf("like", { vx: 3, vy: 0 })).toEqual({ vx: 3, vy: 0 });
  });

  it("gives strong chemistry, always the same with the same person", () => {
    for (const person of HAND) {
      expect(chemistryWith(person)).toBe(chemistryWith(person));
      expect(chemistryWith(person)).toBeGreaterThanOrEqual(84);
      expect(chemistryWith(person)).toBeLessThanOrEqual(96);
    }
  });
});
