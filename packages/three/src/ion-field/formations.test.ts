import { describe, expect, it } from "vitest";
import {
  contourLength,
  contourPoint,
  FORMATION_STRIDE,
  type Formations,
  type LatticeFormation,
  LINK_PAIRS,
  orbitArcPoint,
  orbitTheta,
  PAIR_FIELD_LINES,
  pairFieldPoint,
  pairGeometry,
  toWorldBox,
  type WorldBox,
  writeFormations,
} from "./formations";
import { createIonFieldLayout, MARK, SCHOOL_KEYS } from "./layout";

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

describe("lattice formation", () => {
  // The nodes of a 19 × 11 grid, row after row, across the table's box.
  const columns = 19;
  const rows = 11;
  const nodes = new Float32Array(2 * columns * rows);
  for (let node = 0; node < columns * rows; node += 1) {
    nodes[node * 2] = (node % columns) / (columns - 1);
    nodes[node * 2 + 1] = Math.floor(node / columns) / (rows - 1);
  }
  const count = columns * rows;
  const table = { x: -0.1, y: 0.2, hw: 1.1, hh: 0.6 };
  const lattice: LatticeFormation = { weight: 1, box: table, nodes };
  const unit = 2 / 900;
  /** Where node `node` stands, in world units. */
  const nodeAt = (node: number) => ({
    x: table.x - table.hw + (nodes[node * 2] ?? 0) * 2 * table.hw,
    y: table.y + table.hh - (nodes[node * 2 + 1] ?? 0) * 2 * table.hh,
  });
  const targetOf = (targets: Float32Array, index: number) => ({
    x: targets[index * FORMATION_STRIDE] ?? 0,
    y: targets[index * FORMATION_STRIDE + 1] ?? 0,
  });

  it("rests one lit pair on every node, a hair apart, and holds every particle", () => {
    const { targets, looks, layout } = run({ lattice }, 1600, 2);
    for (let index = 0; index < layout.count; index += 1) {
      expect(targets[index * FORMATION_STRIDE + 2]).toBe(1);
      const node = nodeAt((index >> 1) % count);
      const { x, y } = targetOf(targets, index);
      expect(Math.hypot(x - node.x, y - node.y)).toBeLessThan(2.5 * unit);
      const glow = looks[index * FORMATION_STRIDE + 2] ?? 0;
      if (index >> 1 < count) {
        expect(glow).toBeGreaterThan(0.25);
      } else {
        // The pairs the nodes cannot hold wait there unlit.
        expect(glow).toBe(0);
      }
    }
  });

  it("draws the nodes with fine grains, paper white with a few volt sparks", () => {
    const layout = createIonFieldLayout(800);
    const targets = new Float32Array(layout.count * FORMATION_STRIDE);
    const looks = new Float32Array(layout.count * FORMATION_STRIDE);
    const grains = new Float32Array(layout.count);
    writeFormations(targets, looks, layout, { lattice }, null, 2, unit, grains);
    expect(Math.max(...grains)).toBeLessThanOrEqual(0.42);
    let sparks = 0;
    for (let index = 0; index < 2 * count; index += 1) {
      const offset = index * FORMATION_STRIDE;
      if ((looks[offset] ?? 0) > 0.5) {
        sparks += 1;
      } else {
        expect(looks[offset + 3]).toBeGreaterThan(0.5);
      }
    }
    expect(sparks).toBeGreaterThan(0);
    expect(sparks).toBeLessThan(0.2 * 2 * count);
  });

  it("sends a soft wave of light across the lattice", () => {
    // Halfway through its nine-second cycle, the wave crosses the middle of the table.
    const { looks } = run({ lattice }, 1600, 4.5);
    let lit = 0;
    let dim = 0;
    for (let index = 0; index < 2 * count; index += 1) {
      const node = (index >> 1) % count;
      const along = (nodes[node * 2] ?? 0) * 0.75 + (nodes[node * 2 + 1] ?? 0) * 0.25;
      const glow = looks[index * FORMATION_STRIDE + 2] ?? 0;
      if (Math.abs(along - 0.5) < 0.02) {
        lit = Math.max(lit, glow);
      } else if (Math.abs(along - 0.5) > 0.3) {
        dim = Math.max(dim, glow);
      }
    }
    expect(lit).toBeGreaterThan(0.8);
    expect(dim).toBeLessThan(0.44);
  });

  it("hands the nodes over to the logo mark one after another, from the right", () => {
    const mark = { x: 1.1, y: 0, radius: 0.35 };
    const pair = { weight: 0.5, box: { x: 1.1, y: 0, hw: 0.35, hh: 0.35 }, bond: 1, merge: 1, mark };
    const { targets, layout } = run({ lattice: { ...lattice, weight: 0.5 }, pair }, 1600, 1);
    let resting = 0;
    let gone = 0;
    let restingX = 0;
    for (let index = 0; index < layout.count; index += 2) {
      // Fully held all along: the two shapes share each particle, never set free.
      expect(targets[index * FORMATION_STRIDE + 2]).toBeCloseTo(1, 5);
      const node = (index >> 1) % count;
      const { x, y } = targetOf(targets, index);
      if (Math.hypot(x - mark.x, y - mark.y) < mark.radius * 1.2) {
        gone += 1;
      } else {
        const at = nodeAt(node);
        if (Math.hypot(x - at.x, y - at.y) < 3 * unit) {
          resting += 1;
          restingX += nodes[node * 2] ?? 0;
        }
      }
    }
    const pairs = layout.count / 2;
    // Halfway: most pairs are on their node or in the mark, not squashed in between.
    expect(resting + gone).toBeGreaterThan(pairs * 0.65);
    expect(resting).toBeGreaterThan(pairs * 0.2);
    expect(gone).toBeGreaterThan(pairs * 0.2);
    // The right of the table has left first.
    expect(restingX / resting).toBeLessThan(0.45);
  });

  it("is carried with the table while the page scrolls", () => {
    const layout = createIonFieldLayout(400);
    const targets = new Float32Array(layout.count * FORMATION_STRIDE);
    const looks = new Float32Array(layout.count * FORMATION_STRIDE);
    const moved = { ...lattice, box: { ...table, y: table.y + 0.15 } };
    writeFormations(targets, looks, layout, { lattice: moved }, { lattice }, 1, unit);
    for (let index = 0; index < layout.count; index += 1) {
      expect(targets[index * FORMATION_STRIDE + 3]).toBeCloseTo(0.15, 6);
    }
  });

  describe("reactions", () => {
    const from = { x: -0.6, y: 0.3 };
    const to = { x: 0.4, y: -0.1 };
    const length = Math.hypot(to.x - from.x, to.y - from.y);
    const isChain = (index: number) => index >> 1 >= count && index >> 1 < count + LINK_PAIRS;

    it("draws a chain of bonded atoms from one element to the other, plasma to volt", () => {
      const { targets, looks, layout } = run({ lattice, link: { weight: 1, from, to } }, 1600, 0.5);
      let previous = -1;
      for (let index = 0; index < layout.count; index += 1) {
        if (!isChain(index)) {
          continue;
        }
        const { x, y } = targetOf(targets, index);
        // Along the segment, at most a gentle arc away from it.
        const s = ((x - from.x) * (to.x - from.x) + (y - from.y) * (to.y - from.y)) / length ** 2;
        const away = Math.abs((x - from.x) * (to.y - from.y) - (y - from.y) * (to.x - from.x)) / length;
        expect(s).toBeGreaterThan(0);
        expect(s).toBeLessThan(1);
        expect(away).toBeLessThan(0.13 * length);
        if (index % 2 === 0) {
          // Pair after pair, from the first element to the second.
          expect(s).toBeGreaterThan(previous);
          previous = s;
          const partner = targetOf(targets, index + 1);
          expect(Math.hypot(partner.x - x, partner.y - y)).toBeLessThan(length / LINK_PAIRS);
        }
        const offset = index * FORMATION_STRIDE;
        const [volt, plasma] = [looks[offset] ?? 0, looks[offset + 1] ?? 0];
        expect(s < 0.3 ? plasma > volt : s > 0.7 ? volt > plasma : true).toBe(true);
        expect(looks[offset + 2]).toBeGreaterThan(0);
      }
    });

    it("borrows only its chain from the lattice, as far as it has faded in", () => {
      const { targets, layout } = run({ lattice, link: { weight: 0.5, from, to } }, 1600, 0.5);
      const resting = run({ lattice }, 1600, 0.5).targets;
      for (let index = 0; index < layout.count; index += 1) {
        expect(targets[index * FORMATION_STRIDE + 2]).toBe(1);
        if (!isChain(index)) {
          expect(targetOf(targets, index)).toEqual(targetOf(resting, index));
        }
      }
    });
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
