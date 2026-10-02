import { describe, expect, it } from "vitest";
import { createIonFieldLayout, createRandom, MARK, MARK_ROLES, SCHOOL_KEYS } from "./layout";

describe("createRandom", () => {
  it("is reproducible and stays in [0, 1)", () => {
    const a = createRandom(42);
    const b = createRandom(42);
    for (let index = 0; index < 1000; index += 1) {
      const value = a();
      expect(value).toBe(b());
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });
});

describe("createIonFieldLayout", () => {
  it("needs pairs of particles", () => {
    expect(() => createIonFieldLayout(0)).toThrow(RangeError);
    expect(() => createIonFieldLayout(101)).toThrow(RangeError);
  });

  it("is deterministic, and the first particles do not depend on the total count", () => {
    const small = createIonFieldLayout(240);
    const large = createIonFieldLayout(4000);
    expect(createIonFieldLayout(240)).toEqual(small);
    expect(large.positions.slice(0, 480)).toEqual(small.positions);
    expect(large.schools.slice(0, 240)).toEqual(small.schools);
    expect(large.sizes.slice(0, 240)).toEqual(small.sizes);
  });

  it("pairs opposite charges and spreads the five schools", () => {
    const layout = createIonFieldLayout(2000);
    for (let index = 0; index < layout.count; index += 2) {
      expect((layout.charges[index] ?? 0) + (layout.charges[index + 1] ?? 0)).toBe(0);
    }
    const perSchool = SCHOOL_KEYS.map(
      (_, school) => layout.schools.filter((value) => value === school).length,
    );
    for (const total of perSchool) {
      expect(total).toBeGreaterThan(300);
    }
    for (const value of layout.positions) {
      expect(Math.abs(value)).toBeLessThanOrEqual(1);
    }
  });

  it("condenses into the logo mark", () => {
    const layout = createIonFieldLayout(3000);
    const roles = [0, 0, 0];
    for (let index = 0; index < layout.count; index += 1) {
      const role = layout.roles[index] ?? 0;
      roles[role] = (roles[role] ?? 0) + 1;
      const x = layout.targets[index * 2] ?? 0;
      const y = layout.targets[index * 2 + 1] ?? 0;
      if (role === MARK_ROLES.nucleus) {
        expect(Math.hypot(x, y)).toBeLessThanOrEqual(MARK.nucleusRadius);
      } else if (role === MARK_ROLES.electron) {
        expect(Math.hypot(x - MARK.electron.x, y - MARK.electron.y)).toBeLessThanOrEqual(
          MARK.electron.radius,
        );
      } else {
        // Back in the ellipse's own frame, the point lies on the orbit (within its thickness).
        const ex = x * Math.cos(-MARK.tilt) - y * Math.sin(-MARK.tilt);
        const ey = x * Math.sin(-MARK.tilt) + y * Math.cos(-MARK.tilt);
        expect(Math.hypot(ex, ey / MARK.orbitMinor)).toBeCloseTo(1, 1);
      }
    }
    expect(roles[MARK_ROLES.orbit]).toBeGreaterThan(roles[MARK_ROLES.nucleus] ?? 0);
    expect(roles[MARK_ROLES.electron]).toBeGreaterThan(0);
  });
});
