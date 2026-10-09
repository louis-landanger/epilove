import { describe, expect, it } from "vitest";
import {
  contourLength,
  contourPoint,
  FLIGHT_ORBIT_WIDTH,
  type FlightFormation,
  FORMATION_STRIDE,
  type Formations,
  flightPoint,
  orbitArcPoint,
  orbitTheta,
  PAIR_FIELD_LINES,
  pairFieldPoint,
  pairGeometry,
  riverDistance,
  toWorldBox,
  toWorldFormations,
  type ViewportFormations,
  type WorldBox,
  writeFormations,
} from "./formations";
import { createIonFieldLayout, MARK, SCHOOL_KEYS } from "./layout";
import { RHONE_PATH, RIVER_MAP, SAONE_PATH } from "./rivers";

const box: WorldBox = { x: 0.2, y: -0.1, hw: 0.8, hh: 0.4 };

/** Distance from a point to the rounded rectangle `box` (radius r): 0 on its outline. */
function distanceToRoundedBox(x: number, y: number, r: number): number {
  const qx = Math.abs(x - box.x) - (box.hw - r);
  const qy = Math.abs(y - box.y) - (box.hh - r);
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
}

function run(formations: Formations, count = 2000, time = 3) {
  const layout = createIonFieldLayout(count);
  const targets = new Float32Array(layout.count * FORMATION_STRIDE);
  const looks = new Float32Array(layout.count * FORMATION_STRIDE);
  writeFormations(targets, looks, layout, formations, null, time, 2 / 900);
  return { layout, targets, looks };
}

describe("toWorldBox", () => {
  it("maps viewport pixels to world units (half height = 1, y up)", () => {
    const world = toWorldBox({ left: 0, top: 0, width: 1600, height: 900 }, 1600, 900);
    expect(world.x).toBeCloseTo(0);
    expect(world.y).toBeCloseTo(0);
    expect(world.hw).toBeCloseTo(16 / 9);
    expect(world.hh).toBeCloseTo(1);
    const corner = toWorldBox({ left: 0, top: 0, width: 160, height: 90 }, 1600, 900);
    expect(corner.x).toBeLessThan(-1.5);
    expect(corner.y).toBeGreaterThan(0.8);
  });
});

describe("contourPoint", () => {
  it("walks the outline of the rounded rectangle pushed out by the offset", () => {
    const point = { x: 0, y: 0 };
    for (let index = 0; index < 400; index += 1) {
      contourPoint(box, 0.1, 0.05, index / 400, point);
      expect(distanceToRoundedBox(point.x, point.y, 0.1)).toBeCloseTo(0.05, 6);
    }
  });

  it("starts at the left end of the top edge and spaces points evenly", () => {
    const point = { x: 0, y: 0 };
    contourPoint(box, 0.1, 0, 0, point);
    expect(point.x).toBeCloseTo(box.x - box.hw + 0.1);
    expect(point.y).toBeCloseTo(box.y + box.hh);
    const length = contourLength(box, 0.1, 0);
    const previous = { x: 0, y: 0 };
    contourPoint(box, 0.1, 0, 0, previous);
    for (let index = 1; index <= 200; index += 1) {
      contourPoint(box, 0.1, 0, index / 200, point);
      // A chord is never longer than the arc between the two points.
      expect(Math.hypot(point.x - previous.x, point.y - previous.y)).toBeLessThanOrEqual(length / 200 + 1e-9);
      previous.x = point.x;
      previous.y = point.y;
    }
  });
});

describe("pairGeometry", () => {
  /** Horizontal and vertical half extents of a tilted orbit, in orbit radii. */
  const extentX = Math.hypot(Math.cos(MARK.tilt), MARK.orbitMinor * Math.sin(MARK.tilt));
  const extentY = Math.hypot(Math.sin(MARK.tilt), MARK.orbitMinor * Math.cos(MARK.tilt));
  const pair = (stage: WorldBox, bond = 0, merge = 0) => ({
    box: stage,
    bond,
    merge,
    mark: { x: 1, y: 0.5, radius: 0.3 },
  });
  const inside = (stage: WorldBox, atom: { x: number; y: number }, radius: number) => {
    expect(Math.abs(atom.x - stage.x) + extentX * radius).toBeLessThanOrEqual(stage.hw + 1e-9);
    expect(Math.abs(atom.y - stage.y) + extentY * radius).toBeLessThanOrEqual(stage.hh + 1e-9);
  };

  it("sets the two atoms side by side across a wide stage, filling its height", () => {
    const stage = { x: 0.1, y: 0.05, hw: 1.6, hh: 0.35 };
    for (const time of [0, 1.3, 2.7, 4.2]) {
      const { a, b, radius } = pairGeometry(pair(stage), time);
      inside(stage, a, radius);
      inside(stage, b, radius);
      expect(Math.abs(a.y - b.y)).toBeLessThan(radius * 0.1);
      expect(radius * extentY).toBeGreaterThan(stage.hh * 0.8);
      expect(b.x - a.x).toBeGreaterThan(stage.hw);
    }
  });

  it("sets them on a diagonal in a tall stage, as large as fits without touching", () => {
    const stage = { x: 0, y: 0.4, hw: 0.9, hh: 0.7 };
    const { a, b, radius } = pairGeometry(pair(stage), 0);
    inside(stage, a, radius);
    inside(stage, b, radius);
    // Upper left and lower right.
    expect(a.x).toBeLessThan(stage.x - radius * 0.5);
    expect(a.y).toBeGreaterThan(stage.y + radius * 0.3);
    expect(b.x).toBeGreaterThan(stage.x + radius * 0.5);
    expect(b.y).toBeLessThan(stage.y - radius * 0.3);
    expect(Math.hypot(b.x - a.x, b.y - a.y)).toBeGreaterThan(radius * 2.2);
    // Larger than side by side would allow.
    expect(radius).toBeGreaterThan(stage.hw / (2 * extentX + 0.3));
  });

  it("hooks them together side by side, then merges them into the logo mark", () => {
    const stage = { x: 0, y: 0.4, hw: 0.9, hh: 0.7 };
    const hooked = pairGeometry(pair(stage, 1), 2);
    expect(hooked.a.y).toBeCloseTo(hooked.b.y, 1);
    expect(hooked.b.x - hooked.a.x).toBeCloseTo(hooked.radius * 1.24, 5);
    const merged = pairGeometry(pair(stage, 1, 1), 2);
    expect(merged.a).toEqual({ x: 1, y: 0.5 });
    expect(merged.b).toEqual({ x: 1, y: 0.5 });
    expect(merged.radius).toBeCloseTo(0.3);
    expect(merged.tiltB).toBeCloseTo(MARK.tilt);
  });
});

describe("orbitArcPoint", () => {
  it("spreads evenly spaced fractions evenly along the ellipse", () => {
    const center = { x: 0.3, y: -0.2 };
    const steps = 200;
    const gaps: number[] = [];
    const previous = { x: 0, y: 0 };
    const point = { x: 0, y: 0 };
    orbitArcPoint(center, 0.5, MARK.tilt, 0, previous);
    for (let step = 1; step <= steps; step += 1) {
      orbitArcPoint(center, 0.5, MARK.tilt, step / steps, point);
      gaps.push(Math.hypot(point.x - previous.x, point.y - previous.y));
      previous.x = point.x;
      previous.y = point.y;
    }
    const mean = gaps.reduce((sum, gap) => sum + gap, 0) / gaps.length;
    for (const gap of gaps) {
      expect(gap).toBeGreaterThan(mean * 0.97);
      expect(gap).toBeLessThan(mean * 1.03);
    }
    // Back where it started after a full turn, from the end of the major axis.
    expect(orbitTheta(0)).toBe(0);
    expect(orbitTheta(1)).toBeCloseTo(0);
    expect(orbitTheta(0.5)).toBeCloseTo(Math.PI);
  });
});

describe("pairFieldPoint", () => {
  const stage = { x: 0, y: 0, hw: 2.3, hh: 0.5 };
  const pair = (bond: number) =>
    pairGeometry({ box: stage, bond, merge: 0, mark: { x: 0, y: 0, radius: 1 } }, 0);

  it("arches over the title, from the edge of one nucleus to the other's, higher line by line", () => {
    const geometry = pair(0);
    const { a, b, radius } = geometry;
    const point = { x: 0, y: 0 };
    let apex = 0;
    for (let line = 0; line < PAIR_FIELD_LINES; line += 1) {
      pairFieldPoint(geometry, line, 0, point);
      expect(Math.hypot(point.x - a.x, point.y - a.y)).toBeCloseTo(radius * 0.32, 2);
      pairFieldPoint(geometry, line, 1, point);
      expect(Math.hypot(point.x - b.x, point.y - b.y)).toBeCloseTo(radius * 0.32, 2);
      pairFieldPoint(geometry, line, 0.5, point);
      // Above both nuclei, and no higher than one orbit radius and a quarter.
      expect(point.y).toBeGreaterThan(a.y + radius * 0.9);
      expect(point.y).toBeLessThan(a.y + radius * 1.25);
      expect(point.y).toBeGreaterThan(apex);
      apex = point.y;
      // Steep enough to leave the middle clear: at a tenth of the way, already well above the nuclei.
      pairFieldPoint(geometry, line, 0.1, point);
      expect(point.y).toBeGreaterThan(a.y + radius * 0.45);
    }
  });

  it("flattens into a bond between the two nuclei once they hook together", () => {
    const geometry = pair(1);
    const point = { x: 0, y: 0 };
    pairFieldPoint(geometry, 0, 0.5, point);
    expect(point.y - geometry.a.y).toBeLessThan(geometry.radius * 0.25);
    // The chord is slightly tilted by the two atoms bobbing out of phase.
    expect(point.x).toBeCloseTo((geometry.a.x + geometry.b.x) / 2, 2);
  });
});

describe("writeFormations", () => {
  it("never hands a particle a target that is not a number, even for an empty box", () => {
    // A particle sent to NaN is lost for good: it never comes back to any shape.
    const empty = { left: 0, top: 0, width: 0, height: 0 };
    const cases: ViewportFormations[] = [
      { pair: { weight: 1, box: empty, bond: 1, merge: 1, mark: { x: 700, y: 400, radius: 200 } } },
      { pair: { weight: 1, box: empty, bond: 0, merge: 0, mark: { x: 700, y: 400, radius: 0 } } },
      { card: { weight: 1, box: empty, radius: 24, step: 1 } },
      { pact: { weight: 1, box: empty } },
      { rivers: { weight: 1, box: empty } },
    ];
    for (const formations of cases) {
      const { targets, looks } = run(toWorldFormations(formations, 1440, 900));
      expect([...targets, ...looks].every(Number.isFinite)).toBe(true);
    }
  });

  it("leaves every particle free, at full light, without formations", () => {
    const { targets, looks, layout } = run({});
    for (let index = 0; index < layout.count; index += 1) {
      expect(targets[index * FORMATION_STRIDE + 2]).toBe(0);
      expect(looks[index * FORMATION_STRIDE + 2]).toBe(1);
    }
  });

  it("dims the free particles to the light asked for, and lights them up as a formation takes hold", () => {
    const { targets, looks, layout } = run({ freeGlow: 0.4 });
    for (let index = 0; index < layout.count; index += 1) {
      expect(targets[index * FORMATION_STRIDE + 2]).toBe(0);
      expect(looks[index * FORMATION_STRIDE + 2]).toBeCloseTo(0.4, 6);
    }
    const half = run({ freeGlow: 0.4, pact: { weight: 0.5, x: 0, y: 0, radius: 0.5 } });
    for (let index = 0; index < half.layout.count; index += 1) {
      // Halfway between the dust's light and the ring's own glow.
      expect(half.looks[index * FORMATION_STRIDE + 2]).toBeGreaterThan(0.4);
    }
  });

  it("puts every particle on the card outline, none left drifting", () => {
    for (const step of [0, 0.5, 1, 1.5, 2]) {
      const { targets, layout } = run({ card: { weight: 1, box, radius: 0.07, step } });
      for (let index = 0; index < layout.count; index += 1) {
        const offset = index * FORMATION_STRIDE;
        expect(targets[offset + 2]).toBe(1);
        if (Number.isInteger(step)) {
          const distance = distanceToRoundedBox(targets[offset] ?? 0, targets[offset + 1] ?? 0, 0.07);
          // Outside the card (it hides the canvas), within the motif's reach (about 100 px).
          expect(distance).toBeGreaterThan(0);
          expect(distance).toBeLessThan(0.25);
        }
      }
    }
  });

  it("pours each school into its own tube, up to the level, and keeps all the rest above", () => {
    const tubes = SCHOOL_KEYS.map((_, school) => ({
      box: { x: -0.8 + school * 0.4, y: 0, hw: 0.06, hh: 0.4 },
      level: [0.9, 0.5, 0.2, 0, 0.6][school] ?? 0,
    }));
    const { targets, layout } = run({ tubes: { weight: 1, tubes } });
    const inside = SCHOOL_KEYS.map(() => 0);
    const members = SCHOOL_KEYS.map(() => 0);
    for (let index = 0; index < layout.count; index += 1) {
      const school = layout.schools[index] ?? 0;
      const tube = tubes[school];
      if (!tube) {
        continue;
      }
      members[school] = (members[school] ?? 0) + 1;
      const offset = index * FORMATION_STRIDE;
      expect(targets[offset + 2]).toBe(1);
      const x = targets[offset] ?? 0;
      const y = targets[offset + 1] ?? 0;
      const bottom = tube.box.y - tube.box.hh;
      if (y <= tube.box.y + tube.box.hh) {
        inside[school] = (inside[school] ?? 0) + 1;
        expect(Math.abs(x - tube.box.x)).toBeLessThan(tube.box.hw);
        expect(y).toBeGreaterThanOrEqual(bottom);
        expect(y).toBeLessThanOrEqual(bottom + tube.level * tube.box.hh * 2 + 1e-6);
      } else {
        // Waiting above the mouth of its own tube.
        expect(Math.abs(x - tube.box.x)).toBeLessThan(tube.box.hw * 1.25);
        expect(y).toBeLessThan(tube.box.y + tube.box.hh + tube.box.hw * 3.6);
      }
    }
    for (const [school, tube] of tubes.entries()) {
      const share = (inside[school] ?? 0) / (members[school] ?? 1);
      expect(share).toBeCloseTo(tube.level, 1);
    }
  });

  it("orbits the Pact rings in bonded pairs, every particle included", () => {
    const pact = { weight: 1, x: 0.5, y: 0.1, radius: 0.6 };
    const { targets, layout } = run({ pact });
    for (let index = 0; index < layout.count; index += 2) {
      const a = index * FORMATION_STRIDE;
      const b = (index + 1) * FORMATION_STRIDE;
      expect(targets[a + 2]).toBe(1);
      expect(targets[b + 2]).toBe(1);
      const radius = Math.hypot((targets[a] ?? 0) - pact.x, (targets[a + 1] ?? 0) - pact.y);
      expect(radius).toBeGreaterThan(pact.radius * 0.45);
      expect(radius).toBeLessThan(pact.radius * 1.05);
      // Partners side by side: close enough for the bond to light up (bonds fade out by 0.14).
      expect(
        Math.hypot((targets[a] ?? 0) - (targets[b] ?? 0), (targets[a + 1] ?? 0) - (targets[b + 1] ?? 0)),
      ).toBeLessThan(0.06);
    }
  });

  it("keeps the heavy particles in the nuclei and spreads the orbit evenly", () => {
    const stage = { x: 0, y: 0, hw: 2.3, hh: 0.5 };
    const pair = { weight: 1, box: stage, bond: 0, merge: 0, mark: { x: 0, y: 0, radius: 1 } };
    const { layout, targets, looks } = run({ pair });
    const { a, b, radius } = pairGeometry(pair, 3);
    let orbitDust = 0;
    for (let index = 0; index < layout.count; index += 1) {
      const offset = index * FORMATION_STRIDE;
      expect(targets[offset + 2]).toBe(1);
      const nucleus = index % 2 === 0 ? a : b;
      const distance = Math.hypot((targets[offset] ?? 0) - nucleus.x, (targets[offset + 1] ?? 0) - nucleus.y);
      if ((layout.sizes[index] ?? 0) >= 0.01) {
        // A big particle anywhere else would read as a bead on a thread.
        expect(distance).toBeLessThan(radius * 0.3);
      }
      // Orbit dust: paper-tinted, bigger than the nucleus, no colour of its own.
      if ((looks[offset + 3] ?? 0) > 0.8 && (looks[offset] ?? 0) === 0 && (looks[offset + 1] ?? 0) === 0) {
        orbitDust += 1;
        expect(distance).toBeGreaterThan(radius * MARK.orbitMinor * 0.9);
        expect(distance).toBeLessThan(radius * 1.03);
      }
    }
    expect(orbitDust).toBeGreaterThan(layout.count * 0.6);
  });

  it("dims the logo mark as asked, and leaves its nucleus dark behind what it surrounds", () => {
    const mark = { x: 0.3, y: -0.1, radius: 0.5 };
    const pair = { weight: 1, box: { x: 0, y: 0, hw: 1, hh: 0.5 }, bond: 1, merge: 1, mark };
    const lit = run({ pair });
    const dim = run({ pair: { ...pair, glow: 0.5, core: 0 } });
    let nuclei = 0;
    for (let index = 0; index < lit.layout.count; index += 1) {
      const offset = index * FORMATION_STRIDE;
      const distance = Math.hypot(
        (lit.targets[offset] ?? 0) - mark.x,
        (lit.targets[offset + 1] ?? 0) - mark.y,
      );
      if (distance < mark.radius * 0.3) {
        nuclei += 1;
        expect(dim.looks[offset + 2]).toBe(0);
      } else {
        expect(dim.looks[offset + 2]).toBeCloseTo((lit.looks[offset + 2] ?? 0) * 0.5, 5);
      }
    }
    expect(nuclei).toBeGreaterThan(lit.layout.count * 0.1);
  });

  it("carries the logo mark with what it surrounds as the page scrolls", () => {
    const layout = createIonFieldLayout(400);
    const targets = new Float32Array(layout.count * FORMATION_STRIDE);
    const looks = new Float32Array(layout.count * FORMATION_STRIDE);
    const pair = (y: number) => ({
      weight: 1,
      box: { x: 0, y: 0, hw: 1, hh: 0.5 },
      bond: 1,
      merge: 1,
      mark: { x: 0.2, y, radius: 0.6 },
    });
    writeFormations(targets, looks, layout, { pair: pair(0.1) }, { pair: pair(-0.05) }, 1, 2 / 900);
    for (let index = 0; index < layout.count; index += 1) {
      expect(targets[index * FORMATION_STRIDE + 3]).toBeCloseTo(0.15, 6);
    }
  });

  it("carries particles with their shape's element as the page scrolls", () => {
    const layout = createIonFieldLayout(400);
    const targets = new Float32Array(layout.count * FORMATION_STRIDE);
    const looks = new Float32Array(layout.count * FORMATION_STRIDE);
    const pact = { weight: 1, x: 0.5, y: 0.1, radius: 0.6 };
    const tubes = SCHOOL_KEYS.map((_, school) => ({
      box: { x: school * 0.3, y: 0, hw: 0.05, hh: 0.4 },
      level: 0.5,
    }));
    const scrolled = (dy: number) => ({
      pact: { ...pact, y: pact.y + dy },
      tubes: {
        weight: 1,
        tubes: tubes.map((tube) => ({ ...tube, box: { ...tube.box, y: tube.box.y + dy } })),
      },
    });
    // Without a previous frame there is nothing to carry.
    writeFormations(targets, looks, layout, scrolled(0), null, 1, 2 / 900);
    expect(targets[3]).toBe(0);
    // The page scrolled 0.2 up: the Pact rings and the tubes moved with it.
    writeFormations(targets, looks, layout, { pact: { ...pact, weight: 0.5, y: 0.3 } }, { pact }, 1, 2 / 900);
    expect(targets[3]).toBeCloseTo(0.1, 6); // half held by the Pact
    writeFormations(targets, looks, layout, scrolled(0.2), scrolled(0), 1, 2 / 900);
    for (let index = 0; index < layout.count; index += 1) {
      expect(targets[index * FORMATION_STRIDE + 3]).toBeCloseTo(0.2, 6);
    }
  });

  it("fades the pull with the weight, and hands particles from one shape to the next", () => {
    const half = run({ card: { weight: 0.5, box, radius: 0.07, step: 1 } });
    for (let index = 0; index < half.layout.count; index += 1) {
      expect(half.targets[index * FORMATION_STRIDE + 2]).toBeCloseTo(0.5, 5);
    }
    // Between two shapes whose weights add up to 1, particles stay fully held, on their way across.
    const pact = { weight: 0.5, x: 1.5, y: -0.5, radius: 0.4 };
    const card = run({ card: { weight: 1, box, radius: 0.07, step: 1 } });
    const both = run({ card: { weight: 0.5, box, radius: 0.07, step: 1 }, pact });
    const ring = run({ pact: { ...pact, weight: 1 } });
    for (let index = 0; index < both.layout.count; index += 1) {
      const offset = index * FORMATION_STRIDE;
      expect(both.targets[offset + 2]).toBeCloseTo(1, 5);
      const midway = ((card.targets[offset] ?? 0) + (ring.targets[offset] ?? 0)) / 2;
      expect(both.targets[offset]).toBeCloseTo(midway, 5);
    }
  });
});

describe("the rivers formation", () => {
  // The map's box, as tall as the screen on the right of a wide one (the map is 9.6 km × 14.2 km).
  const map = {
    x: 0.8,
    y: 0,
    hw: (0.96 * (RIVER_MAP.maxX - RIVER_MAP.minX)) / (RIVER_MAP.maxY - RIVER_MAP.minY),
    hh: 0.96,
  };
  const rivers = { weight: 1, box: map };

  it("holds every particle, the Saône's in plasma and the Rhône's in volt", () => {
    const { targets, looks, layout } = run({ rivers });
    for (let index = 0; index < layout.count; index += 1) {
      const offset = index * FORMATION_STRIDE;
      expect(targets[offset + 2]).toBe(1);
      if (index % 2 === 0) {
        expect(looks[offset + 1]).toBeGreaterThan(0.8);
        expect(looks[offset]).toBe(0);
      } else {
        expect(looks[offset]).toBeGreaterThan(0.8);
        expect(looks[offset + 1]).toBe(0);
      }
    }
  });

  it("brings partners to the Confluence at the same moment, each down its own river", () => {
    const layout = createIonFieldLayout(2000);
    for (const time of [0, 7.3, 41, 120]) {
      for (let index = 0; index < layout.count; index += 2) {
        const saone = riverDistance(layout, index, time) - SAONE_PATH.confluence;
        const rhone = riverDistance(layout, index + 1, time) - RHONE_PATH.confluence;
        expect(saone).toBeCloseTo(rhone, 6);
      }
    }
  });

  it("goes on down the merged river side by side, close enough for the bonds to light up", () => {
    const time = 31;
    const { targets, layout } = run({ rivers }, 2000, time);
    let checked = 0;
    for (let index = 0; index < layout.count; index += 2) {
      const past = riverDistance(layout, index, time) - SAONE_PATH.confluence;
      if (past > 2.5 && riverDistance(layout, index, time) < SAONE_PATH.leaves) {
        const a = index * FORMATION_STRIDE;
        const b = a + FORMATION_STRIDE;
        expect(
          Math.hypot((targets[a] ?? 0) - (targets[b] ?? 0), (targets[a + 1] ?? 0) - (targets[b + 1] ?? 0)),
        ).toBeLessThan(0.06);
        checked += 1;
      }
    }
    expect(checked).toBeGreaterThan(50);
  });

  it("keeps the particles dark out of sight, and draws the rivers inside the map", () => {
    const time = 12;
    const { targets, looks, layout } = run({ rivers }, 2000, time);
    let lit = 0;
    for (let index = 0; index < layout.count; index += 1) {
      const path = index % 2 === 0 ? SAONE_PATH : RHONE_PATH;
      const s = riverDistance(layout, index, time);
      const offset = index * FORMATION_STRIDE;
      if (s <= 0 || s >= path.total) {
        // Waiting at its source, or flying back to it: unseen.
        expect(looks[offset + 2]).toBe(0);
      }
      if ((looks[offset + 2] ?? 0) > 0.99) {
        lit += 1;
        expect(Math.abs((targets[offset] ?? 0) - map.x)).toBeLessThan(map.hw * 1.03);
        expect(Math.abs((targets[offset + 1] ?? 0) - map.y)).toBeLessThan(map.hh * 1.03);
      }
    }
    // Most of the particles are in sight at any moment.
    expect(lit).toBeGreaterThan(layout.count * 0.45);
  });

  it("carries the rivers with their map as the page scrolls", () => {
    const layout = createIonFieldLayout(200);
    const targets = new Float32Array(layout.count * FORMATION_STRIDE);
    const looks = new Float32Array(layout.count * FORMATION_STRIDE);
    const moved = { weight: 1, box: { ...map, y: map.y + 0.15 } };
    writeFormations(targets, looks, layout, { rivers: moved }, { rivers }, 2, 2 / 900);
    for (let index = 0; index < layout.count; index += 1) {
      expect(targets[index * FORMATION_STRIDE + 3]).toBeCloseTo(0.15, 6);
    }
  });
});

describe("the plan's flight into the logo mark", () => {
  const mark = { x: 0.9, y: 0.05, radius: 0.45 };
  const flight = (progress: number): FlightFormation => ({
    progress,
    box: { x: -0.4, y: 0.1, hw: 1.2, hh: 1.6 },
    hero: { top: 1.2, height: 4, left: -1.8, right: 1.8 },
    mark,
  });
  const out = { x: 0, y: 0, light: 0 };
  /** A point in the orbit's own plane, where the tilted ring is a circle: in radii of the mark. */
  const inOrbitPlane = (point: { x: number; y: number }) => {
    const dx = (point.x - mark.x) / mark.radius;
    const dy = (point.y - mark.y) / mark.radius;
    const u = dx * Math.cos(MARK.tilt) + dy * Math.sin(MARK.tilt);
    const v = (dy * Math.cos(MARK.tilt) - dx * Math.sin(MARK.tilt)) / MARK.orbitMinor;
    return { away: Math.hypot(u, v), angle: Math.atan2(v, u) };
  };
  // Dots all over the hero, inside the ring and far beyond it.
  const starts = Array.from({ length: 21 * 13 }, (_, index) => ({
    x: -1.7 + (index % 21) * 0.17,
    y: -1.05 + Math.floor(index / 21) * 0.17,
  }));

  it("leaves every dot where the plan painted it until the page scrolls", () => {
    for (const [index, start] of [...starts, { x: mark.x, y: mark.y }].entries()) {
      flightPoint(start, (index * 0.618_033_988_7) % 1, flight(0), out);
      expect(out.x).toBeCloseTo(start.x, 9);
      expect(out.y).toBeCloseTo(start.y, 9);
      expect(out.light).toBe(1);
    }
  });

  it("flies only the dots the plan's canvas shows, fading out at the hero's foot as it does", () => {
    for (const progress of [0, 0.5]) {
      // Above the hero, beyond its sides: never shown.
      for (const start of [
        { x: 0, y: 1.3 },
        { x: -1.9, y: 0 },
        { x: 1.85, y: 0 },
      ]) {
        flightPoint(start, 0.1, flight(progress), out);
        expect(out.light).toBe(0);
      }
    }
    // Halfway down the hero's foot, half lit.
    flightPoint({ x: -1, y: 1.2 - 0.86 * 4 }, 0.1, flight(0), out);
    expect(out.light).toBeCloseTo(0.5, 6);
  });

  it("lands every dot astride the mark's ring, its light gone", () => {
    for (const [index, start] of starts.entries()) {
      flightPoint(start, (index * 0.618_033_988_7) % 1, flight(1), out);
      expect(out.light).toBe(0);
      const { away } = inOrbitPlane(out);
      expect(away).toBeGreaterThanOrEqual(1 - FLIGHT_ORBIT_WIDTH / 2 - 1e-9);
      expect(away).toBeLessThanOrEqual(1 + FLIGHT_ORBIT_WIDTH / 2 + 1e-9);
    }
    // Even the dot right on the mark's centre has somewhere to be,
    flightPoint({ x: mark.x, y: mark.y }, 0.5, flight(1), out);
    expect(Number.isFinite(out.x) && Number.isFinite(out.y)).toBe(true);
    // and every dot, when the mark has no size yet.
    flightPoint({ x: 0.2, y: 0.3 }, 0.5, { ...flight(0.5), mark: { x: 0.9, y: 0.05, radius: 0 } }, out);
    expect(Number.isFinite(out.x) && Number.isFinite(out.y) && Number.isFinite(out.light)).toBe(true);
  });

  it("keeps neighbours together: the streets curl rather than scatter", () => {
    const apart = 0.004;
    const other = { x: 0, y: 0, light: 0 };
    let worst = 0;
    // (Inside the ring, the plan opens out onto it: stretched, not scattered.)
    for (const [index, start] of starts.entries()) {
      if (inOrbitPlane(start).away < 1) {
        continue;
      }
      for (const angle of [0, 1, 2, 3, 4, 5]) {
        const neighbour = { x: start.x + apart * Math.cos(angle), y: start.y + apart * Math.sin(angle) };
        for (let progress = 0; progress <= 1; progress += 0.05) {
          // Different seeds: where a dot goes does not depend on it.
          flightPoint(start, (index * 0.618_033_988_7) % 1, flight(progress), out);
          flightPoint(neighbour, ((index + 1) * 0.618_033_988_7) % 1, flight(progress), other);
          worst = Math.max(worst, Math.hypot(out.x - other.x, out.y - other.y) / apart);
        }
      }
    }
    expect(worst).toBeLessThan(3);
  });

  it("closes in on the ring turning counter-clockwise, as the ring does", () => {
    for (const start of [
      { x: -1.2, y: 0.8 },
      { x: -0.5, y: -0.9 },
      { x: 1.6, y: 0.9 },
    ]) {
      let previous = { gap: Number.POSITIVE_INFINITY, angle: Number.NEGATIVE_INFINITY };
      let first = Number.NaN;
      for (let progress = 0; progress <= 1.0001; progress += 0.05) {
        flightPoint(start, 0.42, flight(progress), out);
        const { away, angle } = inOrbitPlane(out);
        first = Number.isNaN(first) ? angle : first;
        // Unwrapped from the first angle, less than half a turn away either side.
        const turned = first + Math.atan2(Math.sin(angle - first), Math.cos(angle - first));
        expect(Math.abs(away - 1)).toBeLessThanOrEqual(previous.gap + 1e-9);
        expect(turned).toBeGreaterThanOrEqual(previous.angle - 1e-9);
        previous = { gap: Math.abs(away - 1), angle: turned };
      }
      expect(previous.angle - first).toBeGreaterThan(0.3);
    }
  });

  it("turns little while far, more and more near the ring, as water into a whirlpool", () => {
    const start = { x: -1.2, y: 0.8 };
    const angleAt = (progress: number) => {
      flightPoint(start, 0.42, flight(progress), out);
      return inOrbitPlane(out);
    };
    const begin = angleAt(0);
    // The progress at which the dot has come half its way to the ring.
    let half = 0;
    while (angleAt(half).away > (begin.away + 1) / 2) {
      half += 0.001;
    }
    const turned = (from: number, to: number) => {
      const delta = angleAt(to).angle - angleAt(from).angle;
      return Math.atan2(Math.sin(delta), Math.cos(delta));
    };
    expect(turned(half, 1)).toBeGreaterThan(turned(0, half) * 1.5);
  });

  it("sends the dots nearest the ring first, the plan's edges last", () => {
    const near = { x: mark.x - 0.6, y: mark.y };
    const far = { x: -1.6, y: 0.95 };
    flightPoint(near, 0.42, flight(0.3), out);
    expect(inOrbitPlane(out).away - 1).toBeLessThan((inOrbitPlane(near).away - 1) * 0.85);
    flightPoint(far, 0.42, flight(0.3), out);
    expect(out.x).toBeCloseTo(far.x, 9);
    expect(out.y).toBeCloseTo(far.y, 9);
  });

  it("thins the plan out on its way, the last dots fading as they reach the ring", () => {
    // From inside the ring, so the dots leave at once.
    const start = { x: mark.x + 0.05, y: mark.y + 0.02 };
    const lasting = (progress: number) => {
      let sum = 0;
      for (let index = 0; index < 1000; index += 1) {
        flightPoint(start, (index * 0.618_033_988_7) % 1, flight(progress), out);
        sum += out.light;
      }
      return sum / 1000;
    };
    // Whole on take-off,
    expect(lasting(0.03)).toBeGreaterThan(0.99);
    // two thirds of them halfway,
    expect(lasting(0.325)).toBeGreaterThan(0.55);
    expect(lasting(0.325)).toBeLessThan(0.8);
    // a few nearly there,
    expect(lasting(0.464)).toBeGreaterThan(0.1);
    expect(lasting(0.464)).toBeLessThan(0.25);
    // none once landed.
    expect(lasting(1)).toBeLessThan(0.01);
  });
});
