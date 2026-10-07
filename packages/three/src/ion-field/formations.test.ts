import { describe, expect, it } from "vitest";
import {
  contourLength,
  contourPoint,
  FORMATION_STRIDE,
  type Formations,
  orbitArcPoint,
  orbitTheta,
  PAIR_FIELD_LINES,
  pairFieldPoint,
  pairGeometry,
  TITLE_TONES,
  type TitleFormation,
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

describe("title formation", () => {
  // A two-word title: the left word paper, the right one plasma, a few volt points. Each word's
  // outline is traced around its box (one stroke per word, points about 6 px apart), then a grid
  // fills the whole title.
  const box = { x: -0.2, y: 0.3, hw: 1.2, hh: 0.25 };
  const words = [
    { left: 0, right: 0.45 },
    { left: 0.55, right: 1 },
  ];
  const perWord = 240;
  const outline = words.length * perWord;
  const count = outline + 600;
  const points = new Float32Array(2 * count);
  const tones = new Uint8Array(count);
  const toneAt = (index: number, x: number) =>
    index % 41 === 0 ? TITLE_TONES.volt : x < 0.5 ? TITLE_TONES.paper : TITLE_TONES.plasma;
  words.forEach(({ left, right }, word) => {
    // Lengths in world units, so the points are evenly spaced on screen.
    const width = (right - left) * 2 * box.hw;
    const height = 2 * box.hh;
    const perimeter = 2 * (width + height);
    for (let step = 0; step < perWord; step += 1) {
      const d = (step / perWord) * perimeter;
      let x: number;
      let y: number;
      if (d < width) {
        [x, y] = [d, 0];
      } else if (d < width + height) {
        [x, y] = [width, d - width];
      } else if (d < 2 * width + height) {
        [x, y] = [2 * width + height - d, height];
      } else {
        [x, y] = [0, perimeter - d];
      }
      const index = word * perWord + step;
      points[index * 2] = left + x / (2 * box.hw);
      points[index * 2 + 1] = y / height;
      tones[index] = toneAt(index, points[index * 2] ?? 0);
    }
  });
  for (let cell = 0; cell < 600; cell += 1) {
    const index = outline + cell;
    const x = (cell % 30) / 29;
    points[index * 2] = x;
    points[index * 2 + 1] = Math.floor(cell / 30) / 19;
    tones[index] = toneAt(index, x);
  }
  const title: TitleFormation = { weight: 1, box, points, tones, outline };
  const unit = 2 / 900;
  /** Distance from a target to the nearest word outline, in CSS pixels. */
  const fromOutline = (x: number, y: number) =>
    Math.min(
      ...words.map(({ left, right }) => {
        const xl = box.x - box.hw + left * 2 * box.hw;
        const xr = box.x - box.hw + right * 2 * box.hw;
        const [yb, yt] = [box.y - box.hh, box.y + box.hh];
        const inside = Math.min(x - xl, xr - x, yt - y, y - yb);
        const outside = Math.hypot(Math.max(xl - x, 0, x - xr), Math.max(yb - y, 0, y - yt));
        return (inside > 0 ? inside : outside) / unit;
      }),
    );

  it("puts every particle on a point of the glyphs, inside the title's box", () => {
    const { targets, layout } = run({ title }, 2000, 2.5);
    for (let index = 0; index < layout.count; index += 1) {
      const offset = index * FORMATION_STRIDE;
      expect(targets[offset + 2]).toBe(1);
      const x = targets[offset] ?? 0;
      const y = targets[offset + 1] ?? 0;
      // A partner may stand a step (3 px) beside its point, plus the shimmer.
      expect(Math.abs(x - title.box.x)).toBeLessThanOrEqual(title.box.hw + 4 * unit);
      expect(Math.abs(y - title.box.y)).toBeLessThanOrEqual(title.box.hh + 4 * unit);
    }
  });

  it("spreads the particles over the whole title", () => {
    const { targets, layout } = run({ title }, 2000, 0);
    const columns = new Set<number>();
    for (let index = 0; index < layout.count; index += 1) {
      const x = targets[index * FORMATION_STRIDE] ?? 0;
      columns.add(Math.round(((x - (title.box.x - title.box.hw)) / (2 * title.box.hw)) * 29));
    }
    expect(columns.size).toBe(30);
  });

  it("colours each word with its tone", () => {
    const { targets, looks, layout } = run({ title }, 2000, 0);
    let volt = 0;
    for (let index = 0; index < layout.count; index += 1) {
      const offset = index * FORMATION_STRIDE;
      const x = ((targets[offset] ?? 0) - (title.box.x - title.box.hw)) / (2 * title.box.hw);
      const [v, plasma, , paper] = [looks[offset], looks[offset + 1], looks[offset + 2], looks[offset + 3]];
      if ((v ?? 0) > 0.5) {
        volt += 1;
        continue;
      }
      if (x < 0.45) {
        expect(paper).toBeGreaterThan(0.5);
        expect(plasma).toBe(0);
      } else if (x > 0.55) {
        expect(plasma).toBeGreaterThan(0.5);
      }
    }
    expect(volt).toBeGreaterThan(0);
  });

  it("sweeps a sheen of light across the letters", () => {
    // About a third of the way through its 7 s cycle, the sheen crosses the first word.
    const { targets, looks, layout } = run({ title }, 2000, 2.528);
    let lit = 0;
    let dim = 0;
    for (let index = 0; index < layout.count; index += 1) {
      const offset = index * FORMATION_STRIDE;
      const x = ((targets[offset] ?? 0) - (title.box.x - title.box.hw)) / (2 * title.box.hw);
      const glow = looks[offset + 2] ?? 0;
      if (Math.abs(x - 0.25) < 0.02) {
        lit = Math.max(lit, glow);
      } else if (Math.abs(x - 0.25) > 0.3) {
        dim = Math.max(dim, glow);
      }
    }
    expect(lit).toBeGreaterThan(1.6);
    expect(dim).toBeLessThan(1.05);
  });

  /** Share of the pairs on the outlines, and the mean glow of those and of the others. */
  function traced(count: number) {
    const { targets, looks, layout } = run({ title }, count, 0);
    let onOutline = 0;
    let outlineGlow = 0;
    let fillGlow = 0;
    for (let index = 0; index < layout.count; index += 2) {
      const offset = index * FORMATION_STRIDE;
      const glow = looks[offset + 2] ?? 0;
      if (fromOutline(targets[offset] ?? 0, targets[offset + 1] ?? 0) <= 1.5) {
        onOutline += 1;
        outlineGlow += glow;
      } else {
        fillGlow += glow;
      }
    }
    const pairs = layout.count / 2;
    return {
      share: onOutline / pairs,
      outlineGlow: outlineGlow / onOutline,
      fillGlow: fillGlow / Math.max(1, pairs - onOutline),
    };
  }

  it("traces the outlines first, and fills the letters with the other particles", () => {
    // About 2,800 px of outline, an atom every 4 px: 710 particles, a little over a third of 2,000.
    const many = traced(2000);
    expect(many.share).toBeGreaterThan(0.45);
    expect(many.share).toBeLessThan(0.6);
    // Bright outlines, a dim fill: the letters read crisply.
    expect(many.outlineGlow).toBeGreaterThan(3 * many.fillGlow);
  });

  it("gives the outlines nearly all the particles when there are few", () => {
    expect(traced(400).share).toBeGreaterThan(0.82);
  });

  it("spaces the atoms of an outline evenly, each partner halfway to the next pair", () => {
    // Few particles for a long outline: the partner goes several points along the stroke.
    const { targets, layout } = run({ title }, 200, 0);
    let spaced = 0;
    let traced = 0;
    for (let index = 0; index < layout.count; index += 2) {
      const a = index * FORMATION_STRIDE;
      const b = a + FORMATION_STRIDE;
      if (fromOutline(targets[a] ?? 0, targets[a + 1] ?? 0) > 1.5) {
        continue;
      }
      traced += 1;
      const distance = Math.hypot(
        (targets[a] ?? 0) - (targets[b] ?? 0),
        (targets[a + 1] ?? 0) - (targets[b + 1] ?? 0),
      );
      // 480 outline points for 62 pairs: about 4 points, some 24 px, apart.
      if (distance > 12 * unit && distance < 40 * unit) {
        spaced += 1;
      }
    }
    expect(spaced / traced).toBeGreaterThan(0.7);
  });

  it("draws the letters with finer grains than the other shapes", () => {
    const layout = createIonFieldLayout(400);
    const targets = new Float32Array(layout.count * FORMATION_STRIDE);
    const looks = new Float32Array(layout.count * FORMATION_STRIDE);
    const grains = new Float32Array(layout.count);
    writeFormations(targets, looks, layout, { title }, null, 0, unit, grains);
    expect(Math.max(...grains)).toBeLessThan(0.6);
    const mark = { x: 1.1, y: 0, radius: 0.35 };
    const pair = { weight: 1, box: { x: 1.1, y: 0, hw: 0.35, hh: 0.35 }, bond: 1, merge: 1, mark };
    writeFormations(targets, looks, layout, { pair }, null, 0, unit, grains);
    expect(Math.min(...grains)).toBe(1);
  });

  it("hands the letters over to the logo mark one after another, from the right", () => {
    const mark = { x: 1.1, y: 0, radius: 0.35 };
    const pair = { weight: 0.5, box: { x: 1.1, y: 0, hw: 0.35, hh: 0.35 }, bond: 1, merge: 1, mark };
    const { targets, layout } = run({ title: { ...title, weight: 0.5 }, pair }, 2000, 1);
    const left = title.box.x - title.box.hw;
    let written = 0;
    let gone = 0;
    let writtenX = 0;
    for (let index = 0; index < layout.count; index += 1) {
      const offset = index * FORMATION_STRIDE;
      // Fully held all along: the two shapes share each particle, never set free.
      expect(targets[offset + 2]).toBeCloseTo(1, 5);
      const x = targets[offset] ?? 0;
      const y = targets[offset + 1] ?? 0;
      const nearMark = Math.hypot(x - mark.x, y - mark.y) < mark.radius * 1.2;
      const inTitle =
        Math.abs(y - title.box.y) <= title.box.hh + unit && Math.abs(x - title.box.x) <= title.box.hw;
      if (nearMark) {
        gone += 1;
      } else if (inTitle) {
        written += 1;
        writtenX += (x - left) / (2 * title.box.hw);
      }
    }
    // Halfway: most particles are either still in a letter or already in the mark, not squashed in between.
    expect(written + gone).toBeGreaterThan(layout.count * 0.75);
    expect(written).toBeGreaterThan(layout.count * 0.2);
    expect(gone).toBeGreaterThan(layout.count * 0.2);
    // The right of the title has left first.
    expect(writtenX / written).toBeLessThan(0.45);
  });

  it("keeps partners side by side in the letters, never bonded across two words", () => {
    const { targets, layout } = run({ title }, 2000, 0);
    let far = 0;
    for (let index = 0; index < layout.count; index += 2) {
      const a = index * FORMATION_STRIDE;
      const b = (index + 1) * FORMATION_STRIDE;
      const distance = Math.hypot(
        (targets[a] ?? 0) - (targets[b] ?? 0),
        (targets[a + 1] ?? 0) - (targets[b + 1] ?? 0),
      );
      if (distance > 12 * unit) {
        far += 1;
      }
    }
    expect(far).toBe(0);
  });

  it("is carried with the title while the page scrolls", () => {
    const layout = createIonFieldLayout(400);
    const targets = new Float32Array(layout.count * FORMATION_STRIDE);
    const looks = new Float32Array(layout.count * FORMATION_STRIDE);
    const moved = { ...title, box: { ...title.box, y: title.box.y + 0.15 } };
    writeFormations(targets, looks, layout, { title: moved }, { title }, 1, unit);
    for (let index = 0; index < layout.count; index += 1) {
      expect(targets[index * FORMATION_STRIDE + 3]).toBeCloseTo(0.15, 6);
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
