import { beforeAll, describe, expect, it } from "vitest";
import {
  contourLength,
  contourPoint,
  FLIGHT_GATHER_STEP,
  FLIGHT_LANDING,
  FLIGHT_LIFT,
  FLIGHT_MERGE,
  FLIGHT_NUCLEUS,
  FLIGHT_ORBIT_SPIN,
  FLIGHT_ORBIT_WIDTH,
  FLIGHT_PACK_STRIDE,
  FLIGHT_PATCH_STRIDE,
  FLIGHT_RISE,
  FLIGHT_SCATTER,
  FLIGHT_SPREAD,
  type FlightFormation,
  type FlightTarget,
  FORMATION_STRIDE,
  type FormationParticles,
  type Formations,
  flightPoint,
  flightRandom,
  followFlight,
  formationStrength,
  gatherFlight,
  gatherFlightSteps,
  LOGO_BOOST,
  LOGO_DOT,
  LOGO_EDGE,
  LOGO_EDGE_GLOW,
  LOGO_GLOW,
  LOGO_GRAIN,
  LOGO_LIGHT,
  LOGO_ORBIT,
  LOGO_ORBIT_GLOW,
  LOGO_PAPER,
  loadPactStyles,
  FLIGHT_MERGE as MERGE,
  orbitArc,
  orbitArcPoint,
  orbitTheta,
  PAIR_FIELD_LINES,
  packFlight,
  packFlightSteps,
  pairFieldPoint,
  pairGeometry,
  riverDistance,
  riverMapTransform,
  toWorldBox,
  toWorldFormations,
  type ViewportFormations,
  type WorldBox,
  writeFormations,
} from "./formations";
import { createIonFieldLayout, MARK, SCHOOL_KEYS, withParticlesAhead } from "./layout";
import { type LogoShape, loadSchoolLogos, logoColor, schoolLogoShape } from "./logos";
import { COUPLE_BEAT_GLOW, DIAL_HAND_GLOW } from "./pact-styles";
import { RHONE_PATH, RIVER_MAP, SAONE_PATH } from "./rivers";

const box: WorldBox = { x: 0.2, y: -0.1, hw: 0.8, hh: 0.4 };

// The schools' logos and the Pact's styles load on demand (the field asks as their stage comes near).
beforeAll(() => Promise.all([loadSchoolLogos(), loadPactStyles()]));

/** Distance from a point to the rounded rectangle `box` (radius r): 0 on its outline. */
function distanceToRoundedBox(x: number, y: number, r: number): number {
  const qx = Math.abs(x - box.x) - (box.hw - r);
  const qy = Math.abs(y - box.y) - (box.hh - r);
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
}

/** Inside a logo's outline by the even-odd rule (its units, y down). */
function inLogo(shape: LogoShape, x: number, y: number): boolean {
  const { segments } = shape;
  let crossings = 0;
  for (let offset = 0; offset < segments.length; offset += 4) {
    const x0 = segments[offset] ?? 0;
    const y0 = segments[offset + 1] ?? 0;
    const x1 = segments[offset + 2] ?? 0;
    const y1 = segments[offset + 3] ?? 0;
    if (y0 <= y !== y1 <= y && x < x0 + ((y - y0) / (y1 - y0)) * (x1 - x0)) {
      crossings += 1;
    }
  }
  return crossings % 2 === 1;
}

/** Distance from a point to a logo's outline (its units). */
function toLogoEdge(shape: LogoShape, x: number, y: number): number {
  const { segments } = shape;
  let nearest = Number.POSITIVE_INFINITY;
  for (let offset = 0; offset < segments.length; offset += 4) {
    const ax = segments[offset] ?? 0;
    const ay = segments[offset + 1] ?? 0;
    const bx = segments[offset + 2] ?? 0;
    const by = segments[offset + 3] ?? 0;
    const t = Math.max(
      0,
      Math.min(1, ((x - ax) * (bx - ax) + (y - ay) * (by - ay)) / ((bx - ax) ** 2 + (by - ay) ** 2)),
    );
    nearest = Math.min(nearest, Math.hypot(x - (ax + (bx - ax) * t), y - (ay + (by - ay) * t)));
  }
  return nearest;
}

/** Luminance of a colour in linear light. */
const luminance = ({ red, green, blue }: { red: number; green: number; blue: number }) =>
  0.2126 * red + 0.7152 * green + 0.0722 * blue;

/** A logo's colour as its atoms take it: brightened towards LOGO_LIGHT, at most LOGO_BOOST times. */
function brightened(color: { red: number; green: number; blue: number }) {
  const boost = Math.min(LOGO_BOOST, Math.max(1, LOGO_LIGHT / luminance(color)));
  return { red: color.red * boost, green: color.green * boost, blue: color.blue * boost };
}

function run(formations: Formations, count = 2000, time = 3) {
  const layout = createIonFieldLayout(count);
  const targets = new Float32Array(layout.count * FORMATION_STRIDE);
  const looks = new Float32Array(layout.count * FORMATION_STRIDE);
  const tints = new Float32Array(layout.count * FORMATION_STRIDE);
  writeFormations(targets, looks, layout, formations, null, time, 2 / 900, undefined, tints);
  return { layout, targets, looks, tints };
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

  it("finds how far along the orbit any angle stands (orbitArc), the inverse of orbitTheta", () => {
    for (let step = 0; step < 360; step += 1) {
      const s = step / 360;
      expect(orbitArc(orbitTheta(s))).toBeCloseTo(s, 5);
    }
    // Whatever the turn.
    expect(orbitArc(orbitTheta(0.3) + 4 * Math.PI)).toBeCloseTo(0.3, 5);
    expect(orbitArc(orbitTheta(0.3) - 2 * Math.PI)).toBeCloseTo(0.3, 5);
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
      { logo: { weight: 1, box: empty, school: 0 } },
      { logo: { weight: 1, box: empty, school: -1 } },
    ];
    for (const formations of cases) {
      const { targets, looks, tints } = run(toWorldFormations(formations, 1440, 900));
      expect([...targets, ...looks, ...tints].every(Number.isFinite)).toBe(true);
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
    const half = run({ freeGlow: 0.4, pact: { weight: 0.5, x: 0, y: 0, radius: 0.5, style: "vial" } });
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

  it("draws the logo of the school it shows with every particle, nearly half along its edges, the rest in its ink", () => {
    const logo = { weight: 1, x: 0.4, y: -0.1, size: 0.5, school: 2 };
    const { targets, looks, layout } = run({ logo });
    const shape = schoolLogoShape(2) as LogoShape;
    const scale = (2 * logo.size) / Math.max(shape.width, shape.height);
    const astray: string[] = [];
    let edges = 0;
    for (let index = 0; index < layout.count; index += 1) {
      const offset = index * FORMATION_STRIDE;
      expect(targets[offset + 2]).toBe(1);
      expect(looks[offset + 3]).toBeCloseTo(LOGO_PAPER, 6);
      // Back in the logo's box (its units, y down).
      const x = shape.width / 2 + ((targets[offset] ?? 0) - logo.x) / scale;
      const y = shape.height / 2 - ((targets[offset + 1] ?? 0) - logo.y) / scale;
      const edge = looks[offset + 2] === Math.fround(LOGO_EDGE_GLOW);
      edges += edge ? 1 : 0;
      const away = toLogoEdge(shape, x, y);
      // On an edge, or in the ink: give or take the atom's wander (and, in the ink, half a row).
      if (
        edge
          ? away > 0.55
          : looks[offset + 2] !== Math.fround(LOGO_GLOW) || (!inLogo(shape, x, y) && away > 1.2)
      ) {
        astray.push(`particle ${index}${edge ? " (edge)" : ""}: ${away.toFixed(2)} from the outline`);
      }
    }
    expect(astray.slice(0, 5)).toEqual([]);
    expect(edges / layout.count).toBeCloseTo(LOGO_EDGE, 1);
    expect(LOGO_EDGE_GLOW).toBeGreaterThan(LOGO_GLOW);
    // In fine, even dots, their halos clear of the letters cut out of the logo: none bigger than LOGO_DOT.
    const grains = new Float32Array(layout.count);
    writeFormations(
      new Float32Array(targets.length),
      new Float32Array(looks.length),
      layout,
      { logo },
      null,
      3,
      2 / 900,
      grains,
    );
    for (let index = 0; index < layout.count; index += 1) {
      const grain = grains[index] ?? 0;
      expect(grain).toBeLessThanOrEqual(Math.fround(LOGO_GRAIN));
      expect(grain * (layout.sizes[index] ?? 0)).toBeLessThanOrEqual(LOGO_GRAIN * LOGO_DOT + 1e-6);
    }
  });

  it("keeps each particle in its place in the logo, never jumping across it", () => {
    // EPITA's letters are cut out of its triangles: a particle sent from one edge to another would
    // cross a letter, a stray dot in the middle of it.
    const logo = { weight: 1, x: 0, y: 0, size: 0.5, school: 0 };
    const shape = schoolLogoShape(0) as LogoShape;
    const scale = (2 * logo.size) / Math.max(shape.width, shape.height);
    const jumps: string[] = [];
    for (let time = 3; time < 40; time += 0.5) {
      const now = run({ logo }, 2000, time);
      const next = run({ logo }, 2000, time + 1 / 60);
      for (let index = 0; index < now.layout.count; index += 1) {
        const offset = index * FORMATION_STRIDE;
        const moved = Math.hypot(
          (next.targets[offset] ?? 0) - (now.targets[offset] ?? 0),
          (next.targets[offset + 1] ?? 0) - (now.targets[offset + 1] ?? 0),
        );
        if (moved / scale > 0.2) {
          jumps.push(`${time} s, particle ${index}: ${(moved / scale).toFixed(2)} logo units in a frame`);
        }
      }
    }
    expect(jumps.slice(0, 5)).toEqual([]);
  });

  it("takes each atom a short way from one school's logo to the next, and round the orbit with no school", () => {
    const logo = { weight: 1, x: 0, y: 0, size: 0.5, school: 0 };
    const logos = SCHOOL_KEYS.map((_, school) => run({ logo: { ...logo, school } }));
    for (const [school, now] of logos.entries()) {
      const next = logos[(school + 1) % logos.length] ?? now;
      let moved = 0;
      for (let index = 0; index < now.layout.count; index += 1) {
        const offset = index * FORMATION_STRIDE;
        moved += Math.hypot(
          (next.targets[offset] ?? 0) - (now.targets[offset] ?? 0),
          (next.targets[offset + 1] ?? 0) - (now.targets[offset + 1] ?? 0),
        );
      }
      // The same places handed out at random would send them twice as far: about the stage's half side.
      expect(moved / now.layout.count).toBeLessThan(0.5 * logo.size);
    }
    const none = run({ logo: { ...logo, school: -1 } });
    for (let index = 0; index < none.layout.count; index += 1) {
      const offset = index * FORMATION_STRIDE;
      // On the logo mark's tilted orbit round the stage.
      const dx = (none.targets[offset] ?? 0) - logo.x;
      const dy = (none.targets[offset + 1] ?? 0) - logo.y;
      const ex = dx * Math.cos(MARK.tilt) + dy * Math.sin(MARK.tilt);
      const ey = -dx * Math.sin(MARK.tilt) + dy * Math.cos(MARK.tilt);
      const radius = logo.size * LOGO_ORBIT;
      const reach = Math.hypot(ex / radius, ey / (radius * MARK.orbitMinor));
      expect(reach).toBeGreaterThan(0.9);
      expect(reach).toBeLessThan(1.1);
      expect(none.looks[offset + 2]).toBe(Math.fround(LOGO_ORBIT_GLOW));
      expect(none.looks[offset + 3]).toBe(0);
    }
  });

  it("colours each atom of the logo in its school's colours, those of its place in the logo", () => {
    // ESME: blue at the top, green at the bottom.
    const school = SCHOOL_KEYS.indexOf("esme");
    const logo = { weight: 1, x: 0.4, y: -0.1, size: 0.5, school };
    const { targets, tints, layout } = run({ logo });
    const shape = schoolLogoShape(school) as LogoShape;
    const scale = (2 * logo.size) / Math.max(shape.width, shape.height);
    const color = { red: 0, green: 0, blue: 0 };
    const top = { green: 0, blue: 0 };
    const bottom = { green: 0, blue: 0 };
    for (let index = 0; index < layout.count; index += 1) {
      const offset = index * FORMATION_STRIDE;
      // All of its paper tint in the logo's colours, those of where it stands, give or take its wander,
      // brightened.
      expect(tints[offset + 3]).toBe(1);
      const x = shape.width / 2 + ((targets[offset] ?? 0) - logo.x) / scale;
      const y = shape.height / 2 - ((targets[offset + 1] ?? 0) - logo.y) / scale;
      logoColor(shape, x, y, color);
      const { red, green, blue } = brightened(color);
      expect(tints[offset]).toBeCloseTo(red, 1);
      expect(tints[offset + 1]).toBeCloseTo(green, 1);
      expect(tints[offset + 2]).toBeCloseTo(blue, 1);
      const end = y < 20 ? top : y > 80 ? bottom : null;
      if (end) {
        end.green += tints[offset + 1] ?? 0;
        end.blue += tints[offset + 2] ?? 0;
      }
    }
    expect(top.blue).toBeGreaterThan(top.green);
    expect(bottom.green).toBeGreaterThan(bottom.blue);
  });

  it("brightens a logo's darker colours, hue kept, nearly as bright as paper white, and leaves the light ones", () => {
    const logo = { weight: 1, x: 0, y: 0, size: 0.5, school: 0 };
    const tinted = (index: number, tints: Float32Array) => ({
      red: tints[index * FORMATION_STRIDE] ?? 0,
      green: tints[index * FORMATION_STRIDE + 1] ?? 0,
      blue: tints[index * FORMATION_STRIDE + 2] ?? 0,
    });
    // ISG's blue gives about a third of white's light: each atom brought up to LOGO_LIGHT, as blue.
    const isg = SCHOOL_KEYS.indexOf("isg");
    const blue = { red: 0, green: 0, blue: 0 };
    logoColor(schoolLogoShape(isg) as LogoShape, 50, 50, blue);
    expect(luminance(blue)).toBeLessThan(0.4);
    const ink = run({ logo: { ...logo, school: isg } });
    for (let index = 0; index < ink.layout.count; index += 1) {
      const lit = tinted(index, ink.tints);
      expect(luminance(lit)).toBeCloseTo(LOGO_LIGHT, 3);
      expect(lit.red / lit.blue).toBeCloseTo(blue.red / blue.blue, 3);
      expect(lit.green / lit.blue).toBeCloseTo(blue.green / blue.blue, 3);
    }
    // Sup'Biotech's lime is light enough: the atoms of its molecule (the top of its biggest atom) take it as it is.
    const supbiotech = SCHOOL_KEYS.indexOf("supbiotech");
    const shape = schoolLogoShape(supbiotech) as LogoShape;
    const scale = (2 * logo.size) / Math.max(shape.width, shape.height);
    const lime = { red: 0, green: 0, blue: 0 };
    const molecule = run({ logo: { ...logo, school: supbiotech } });
    let atoms = 0;
    for (let index = 0; index < molecule.layout.count; index += 1) {
      const offset = index * FORMATION_STRIDE;
      const x = shape.width / 2 + (molecule.targets[offset] ?? 0) / scale;
      const y = shape.height / 2 - (molecule.targets[offset + 1] ?? 0) / scale;
      if (Math.hypot(x - 65, y - 19) < 3.5) {
        atoms += 1;
        logoColor(shape, x, y, lime);
        expect(luminance(lime)).toBeGreaterThan(LOGO_LIGHT);
        const lit = tinted(index, molecule.tints);
        expect(lit.red).toBeCloseTo(lime.red, 2);
        expect(lit.green).toBeCloseTo(lime.green, 2);
        expect(lit.blue).toBeCloseTo(lime.blue, 2);
      }
    }
    expect(atoms).toBeGreaterThan(5);
  });

  it("keeps the paper white in the other shapes, round the empty stage, and blends it with a logo's colours", () => {
    const school = SCHOOL_KEYS.indexOf("isg");
    const logo = { weight: 1, x: 0, y: 0, size: 0.5, school };
    for (const formations of [
      { pact: { weight: 1, x: 0, y: 0, radius: 0.5 } },
      { card: { weight: 1, box, radius: 0.07, step: 1 }, freePaper: 0.4 },
      { logo: { ...logo, school: -1 } },
    ]) {
      const { tints } = run(formations);
      expect(tints.every((value) => value === 0)).toBe(true);
    }
    // Half held by the logo, the paper half white (that of the free particles), half the logo's colours.
    const { looks, tints, layout } = run({ freePaper: 0.5, logo: { ...logo, weight: 0.5 } });
    const own = (LOGO_PAPER * 0.5) / (0.5 + (LOGO_PAPER - 0.5) * 0.5);
    const probed = { red: 0, green: 0, blue: 0 };
    logoColor(schoolLogoShape(school) as LogoShape, 50, 50, probed);
    const color = brightened(probed);
    for (let index = 0; index < layout.count; index += 1) {
      const offset = index * FORMATION_STRIDE;
      expect(looks[offset + 3]).toBeCloseTo(0.5 + (LOGO_PAPER - 0.5) * 0.5, 6);
      expect(tints[offset + 3]).toBeCloseTo(own, 6);
      // ISG's logo is of one colour: premultiplied by its share.
      expect(tints[offset + 2]).toBeCloseTo(color.blue * own, 3);
    }
  });

  it("fits the logo in the largest square of its box, and counts it among the shapes", () => {
    const formations = toWorldFormations(
      { logo: { weight: 0.7, box: { left: 760, top: 200, width: 600, height: 400 }, school: 4 } },
      1440,
      900,
    );
    expect(formations.logo?.weight).toBe(0.7);
    expect(formations.logo?.school).toBe(4);
    expect(formations.logo?.x).toBeCloseTo(((760 + 300 - 720) * 2) / 900, 6);
    expect(formations.logo?.y).toBeCloseTo(((450 - 400) * 2) / 900, 6);
    expect(formations.logo?.size).toBeCloseTo(400 / 900, 6);
    expect(formationStrength(formations)).toBe(0.7);
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

  it("seals the Pact's vial in its rings: bonded pairs round each ring, whole, the rest in the vial", () => {
    const pact = { weight: 1, x: 0.5, y: 0.1, radius: 0.6, style: "vial" as const };
    const { targets, layout } = run({ pact });
    const at = (index: number) => ({
      dx: (targets[index * FORMATION_STRIDE] ?? 0) - pact.x,
      dy: (targets[index * FORMATION_STRIDE + 1] ?? 0) - pact.y,
    });
    const ringOf = ({ dx, dy }: { dx: number; dy: number }) =>
      [1, 0.77, 0.52].findIndex((r) => Math.abs(Math.hypot(dx, dy) / pact.radius - r) < 0.025);
    // Each ring's particles all the way round it (they once drew only arcs): every twelfth of each has some.
    const sectors = [new Set<number>(), new Set<number>(), new Set<number>()];
    let inVial = 0;
    for (let index = 0; index < layout.count; index += 2) {
      expect(targets[index * FORMATION_STRIDE + 2]).toBe(1);
      expect(targets[(index + 1) * FORMATION_STRIDE + 2]).toBe(1);
      const a = at(index);
      const b = at(index + 1);
      const ring = ringOf(a);
      // Partners side by side on a ring: close enough for the bond to light up (bonds fade out by 0.14).
      if (ring >= 0 && ringOf(b) === ring && Math.hypot(a.dx - b.dx, a.dy - b.dy) < 0.06) {
        sectors[ring]?.add(Math.floor(((Math.atan2(a.dy, a.dx) / (2 * Math.PI) + 1) % 1) * 12));
        continue;
      }
      // Or both in the vial, in the middle of the stage.
      for (const { dx, dy } of [a, b]) {
        expect(Math.abs(dx)).toBeLessThan(pact.radius * 0.26);
        expect(Math.abs(dy)).toBeLessThan(pact.radius * 0.62);
      }
      inVial += 2;
    }
    expect(sectors.map((sector) => sector.size)).toEqual([12, 12, 12]);
    expect(inVial / layout.count).toBeCloseTo(0.4, 1);
  });

  it("draws the Pact's dial, its hand lighting each tick in turn as the countdown's seconds run down", () => {
    const pact = { weight: 1, x: -0.2, y: 0.3, radius: 0.5, style: "dial" as const };
    for (const seconds of [59.9, 42.5, 0.4]) {
      const { targets, looks, layout } = run({ pact: { ...pact, seconds } });
      // The tick the hand last went by, clockwise from the top.
      const hand = 60 - seconds;
      let brightest = { glow: 0, tick: -1 };
      for (let index = 0; index < layout.count; index += 1) {
        const offset = index * FORMATION_STRIDE;
        const dx = (targets[offset] ?? 0) - pact.x;
        const dy = (targets[offset + 1] ?? 0) - pact.y;
        const radius = Math.hypot(dx, dy) / pact.radius;
        expect(radius).toBeGreaterThan(0.75);
        expect(radius).toBeLessThan(1.01);
        const tick = (((Math.PI / 2 - Math.atan2(dy, dx)) / (2 * Math.PI)) * 60 + 60) % 60;
        if (radius < 0.93 && (looks[offset + 2] ?? 0) > brightest.glow) {
          brightest = { glow: looks[offset + 2] ?? 0, tick: Math.round(tick) % 60 };
        }
      }
      expect(brightest.tick).toBe(Math.floor(hand) % 60);
      expect(brightest.glow).toBeGreaterThan(DIAL_HAND_GLOW);
    }
  });

  it("draws the Pact's couple: two atoms on a diagonal, a pulse along their bond once a second", () => {
    const pact = { weight: 1, x: 0.1, y: -0.2, radius: 0.5, style: "couple" as const };
    const brightest = (seconds: number) => {
      const { targets, looks, layout } = run({ pact: { ...pact, seconds } });
      let found = { glow: 0, x: 0, y: 0 };
      let left = 0;
      for (let index = 0; index < layout.count; index += 1) {
        const offset = index * FORMATION_STRIDE;
        const x = (targets[offset] ?? 0) - pact.x;
        const y = (targets[offset + 1] ?? 0) - pact.y;
        expect(Math.abs(x)).toBeLessThan(pact.radius * 0.96);
        expect(Math.abs(y)).toBeLessThan(pact.radius * 0.6);
        left += x < 0 ? 1 : 0;
        if ((looks[offset + 2] ?? 0) > found.glow) {
          found = { glow: looks[offset + 2] ?? 0, x, y };
        }
      }
      // As many particles in each atom's half.
      expect(left / layout.count).toBeCloseTo(0.5, 1);
      return found;
    };
    // Just after the countdown ticks, the pulse leaves the first atom, up on the left; a moment
    // later it is further down the bond, towards the second.
    const early = brightest(32.9);
    const later = brightest(32.7);
    expect(early.glow).toBeGreaterThan(COUPLE_BEAT_GLOW * 0.8);
    expect(early.x).toBeLessThan(0);
    expect(later.x).toBeGreaterThan(early.x);
    expect(later.y).toBeLessThan(early.y);
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
    // Between two shapes whose weights add up to 1, particles stay fully held, each in one of them.
    const pact = { weight: 0.5, x: 1.5, y: -0.5, radius: 0.4 };
    const card = run({ card: { weight: 1, box, radius: 0.07, step: 1 } });
    const both = run({ card: { weight: 0.5, box, radius: 0.07, step: 1 }, pact });
    const ring = run({ pact: { ...pact, weight: 1 } });
    let ringed = 0;
    for (let index = 0; index < both.layout.count; index += 1) {
      const offset = index * FORMATION_STRIDE;
      expect(both.targets[offset + 2]).toBeCloseTo(1, 5);
      const x = both.targets[offset] ?? 0;
      const inRing = Math.abs(x - (ring.targets[offset] ?? 0)) < 1e-5;
      expect(inRing || Math.abs(x - (card.targets[offset] ?? 0)) < 1e-5).toBe(true);
      ringed += inRing ? 1 : 0;
    }
    expect(ringed / both.layout.count).toBeCloseTo(0.5, 1);
  });
  it("hands the particles over from one section's shape to the next whole: none hangs between the two", () => {
    // Reported: between the tubes and the schools' logos, the particles hung in a cloud halfway
    // across the page for as long as it rested there. Each belongs to one shape or the other, the
    // next one's share of them growing with its weight.
    const tubes = {
      weight: 1,
      tubes: SCHOOL_KEYS.map((_, school) => ({
        box: { x: -0.8 + school * 0.4, y: 0.4, hw: 0.06, hh: 0.4 },
        level: 0.5,
      })),
    };
    const logo = { weight: 1, x: 0.5, y: -0.6, size: 0.4, school: 1 };
    const inTubes = run({ tubes });
    const inLogo = run({ logo });
    for (const share of [0.1, 0.5, 0.9]) {
      const both = run({ tubes: { ...tubes, weight: 1 - share }, logo: { ...logo, weight: share } });
      const astray: string[] = [];
      let moved = 0;
      for (let index = 0; index < both.layout.count; index += 1) {
        const offset = index * FORMATION_STRIDE;
        const at = (shape: { targets: Float32Array }) =>
          Math.hypot(
            (both.targets[offset] ?? 0) - (shape.targets[offset] ?? 0),
            (both.targets[offset + 1] ?? 0) - (shape.targets[offset + 1] ?? 0),
          ) < 1e-5;
        expect(both.targets[offset + 2]).toBeCloseTo(1, 5);
        if (at(inLogo)) {
          moved += 1;
        } else if (!at(inTubes)) {
          astray.push(`particle ${index} between the two shapes`);
        }
      }
      expect(astray.slice(0, 5)).toEqual([]);
      expect(moved / both.layout.count).toBeCloseTo(share, 1);
    }
  });
});

describe("the shapes after a hero with more particles", () => {
  // The fleuves hero's field: 5,600 particles of its own for the rivers, 1,400 kept ahead for the
  // plan of Lyon. The landing's: 1,600. Past the hero, the cards, the tubes and the Pact rings
  // light the landing's particles, as on the landing; the others fuse into them.
  const kept = 1400;
  const lit = 1600;
  const hero: FormationParticles = {
    ...withParticlesAhead(createIonFieldLayout(5600), kept),
    flight: {
      count: kept,
      patches: new Float32Array(kept * FLIGHT_PATCH_STRIDE),
      reveal: 1,
      landed: new Float32Array(kept).fill(-1),
    },
    shapes: lit,
  };
  const landing = createIonFieldLayout(lit);
  const tubes = SCHOOL_KEYS.map((_, school) => ({
    box: { x: -0.8 + school * 0.4, y: 0, hw: 0.06, hh: 0.4 },
    level: [0.9, 0.5, 0.2, 0, 0.6][school] ?? 0,
  }));
  const shapes: Formations[] = [0, 1, 2].map((step) => ({ card: { weight: 1, box, radius: 0.07, step } }));
  shapes.push({ tubes: { weight: 1, tubes } }, { pact: { weight: 1, x: 0.5, y: 0.1, radius: 0.6 } });
  const write = (particles: FormationParticles, formations: Formations) => {
    const targets = new Float32Array(particles.count * FORMATION_STRIDE);
    const looks = new Float32Array(particles.count * FORMATION_STRIDE);
    writeFormations(targets, looks, particles, formations, null, 3, 2 / 900);
    return { targets, looks };
  };
  /** The particle the hero's particle `index` fuses into past the hero: one of the landing's, partners into partners. */
  const host = (index: number) => kept + ((index < kept ? index : index - kept) % lit);

  it("lights the landing's particles in them, just as the landing does, and fuses the others into them", () => {
    for (const formations of shapes) {
      const ours = write(hero, formations);
      const theirs = write(landing, formations);
      const wrong: string[] = [];
      for (let index = 0; index < hero.count; index += 1) {
        const at = index * FORMATION_STRIDE;
        const own = index - kept;
        if (own >= 0 && own < lit) {
          // One of the landing's: where it stands there, as lit.
          for (let k = 0; k < FORMATION_STRIDE; k += 1) {
            if (ours.targets[at + k] !== theirs.targets[own * FORMATION_STRIDE + k]) {
              wrong.push(`particle ${index} not where the landing's ${own} stands`);
            }
            if (ours.looks[at + k] !== theirs.looks[own * FORMATION_STRIDE + k]) {
              wrong.push(`particle ${index} not lit as the landing's ${own}`);
            }
          }
        } else {
          // Another: where its host stands, unlit.
          const there = host(index) * FORMATION_STRIDE;
          if (ours.targets[at] !== ours.targets[there] || ours.targets[at + 1] !== ours.targets[there + 1]) {
            wrong.push(`particle ${index} not on its host ${host(index)}`);
          }
          if (ours.looks[at + 2] !== 0) {
            wrong.push(`particle ${index} still lit`);
          }
        }
      }
      expect(wrong.slice(0, 5)).toEqual([]);
    }
  });

  it("fuses them on the way from the logo mark, and brings them back out on the way back", () => {
    const mark = { x: 0.8, y: 0, radius: 0.45 };
    const pair = (weight: number) => ({
      weight,
      box: { x: mark.x, y: mark.y, hw: mark.radius, hh: mark.radius },
      bond: 1,
      merge: 1,
      mark,
    });
    const card = (weight: number) => ({ weight, box, radius: 0.07, step: 2 });
    // The particles the hero has beyond those the shapes light.
    const extras = Array.from({ length: hero.count - kept - lit }, (_, k) => kept + lit + k);
    const inMarkOnly = write(hero, { pair: pair(1) });
    for (const inMark of [1, 0.75, 0.5, 0.25, 0]) {
      const { targets, looks } = write(hero, { pair: pair(inMark), card: card(1 - inMark) });
      const wrong: string[] = [];
      let gone = 0;
      for (const index of extras) {
        const at = index * FORMATION_STRIDE;
        const there = host(index) * FORMATION_STRIDE;
        if (targets[at] === targets[there] && targets[at + 1] === targets[there + 1]) {
          // Gone with its host, where it goes, fused into it: unlit.
          gone += 1;
          if (looks[at + 2] !== 0) {
            wrong.push(`particle ${index} still lit on its host`);
          }
        } else if (targets[at] !== inMarkOnly.targets[at] || looks[at + 2] !== inMarkOnly.looks[at + 2]) {
          // Or in the mark, shining as it does there. (Back up, the same in reverse.)
          wrong.push(`particle ${index} neither in the mark nor on its host`);
        }
      }
      expect(wrong.slice(0, 5)).toEqual([]);
      // As many gone as the cards hold.
      expect(gone / extras.length).toBeCloseTo(1 - inMark, 1);
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
  // The hero, its foot at -1.2: the plan fades out below -0.53, as its canvas does.
  const hero = { top: 1.2, height: 2.4, left: -1.8, right: 1.8 };
  const flight = (progress: number, { radius = mark.radius, presence = 1 } = {}): FlightFormation => ({
    progress,
    presence,
    box: { x: -0.4, y: 0.1, hw: 1.2, hh: 1.6 },
    hero,
    mark: { ...mark, radius },
  });
  const map = riverMapTransform(flight(0).box);
  const out = { x: 0, y: 0, light: 0, plasma: 0 };
  const dots = Array.from({ length: 400 }, (_, index) => index);
  /** The particle a patch lands as, standing at `at`. */
  const towards = (index: number, at: { x: number; y: number }, nucleus = false): FlightTarget => ({
    index,
    x: at.x,
    y: at.y,
    nucleus,
  });
  /** A point in the orbit's own plane, where the tilted ring is a circle: its distance in radii of the mark, and its angle. */
  const inOrbitPlane = (point: { x: number; y: number }) => {
    const dx = (point.x - mark.x) / mark.radius;
    const dy = (point.y - mark.y) / mark.radius;
    const u = dx * Math.cos(MARK.tilt) + dy * Math.sin(MARK.tilt);
    const v = (dy * Math.cos(MARK.tilt) - dx * Math.sin(MARK.tilt)) / MARK.orbitMinor;
    return { away: Math.hypot(u, v), angle: Math.atan2(v, u) };
  };
  // Dots all over the hero, above its foot.
  const starts = Array.from({ length: 17 * 9 }, (_, index) => ({
    x: -1.6 + (index % 17) * 0.2,
    y: -0.5 + Math.floor(index / 17) * 0.2,
  }));
  /** The plan as a grid of dots, one every 50 m over the map, half lit. */
  const plan = (() => {
    const xs: number[] = [];
    const ys: number[] = [];
    for (let x = RIVER_MAP.minX; x <= RIVER_MAP.maxX; x += 0.05) {
      for (let y = RIVER_MAP.minY; y <= RIVER_MAP.maxY; y += 0.05) {
        xs.push(x);
        ys.push(y);
      }
    }
    const place = new Float32Array(xs.length * 2);
    const look = new Float32Array(xs.length * 4);
    for (const [index, x] of xs.entries()) {
      place[index * 2] = x;
      place[index * 2 + 1] = ys[index] ?? 0;
      look.set([1, 1, 1, 0.5], index * 4);
    }
    return { count: xs.length, place, look };
  })();
  /** A field of `count` particles keeping its first `kept` for the plan, the plan gathered into them. */
  const fieldFor = (count: number, kept: number, progress = 0) => {
    const particles = {
      ...createIonFieldLayout(count),
      flight: {
        count: kept,
        patches: new Float32Array(kept * FLIGHT_PATCH_STRIDE),
        reveal: 1,
        landed: new Float32Array(kept).fill(-1),
      },
    };
    const landing = new Float32Array(plan.count * 2);
    const side = gatherFlight(plan.place, plan.look, flight(progress), particles, landing);
    return { particles, landing, side };
  };
  const write = (
    particles: FormationParticles,
    formations: Formations,
    time = 0,
    previous: Formations | null = null,
  ) => {
    const targets = new Float32Array(particles.count * FORMATION_STRIDE);
    const looks = new Float32Array(particles.count * FORMATION_STRIDE);
    writeFormations(targets, looks, particles, formations, previous, time, 2 / 900);
    return { targets, looks };
  };
  const shownAt = (x: number, y: number) => {
    flightPoint({ x, y }, 0, towards(0, mark), flight(0), out);
    return out.light;
  };

  it("draws each dot's random numbers evenly, with no pattern across dots or channels", () => {
    const count = 20_000;
    const first = Array.from({ length: count }, (_, dot) => flightRandom(dot, 2));
    const second = Array.from({ length: count }, (_, dot) => flightRandom(dot, 3));
    expect(first.every((value) => value >= 0 && value < 1)).toBe(true);
    const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
    expect(mean(first)).toBeCloseTo(0.5, 1);
    // Tenths evenly filled…
    const tenths = Array.from(
      { length: 10 },
      (_, tenth) => first.filter((value) => Math.floor(value * 10) === tenth).length,
    );
    expect(Math.min(...tenths) / Math.max(...tenths)).toBeGreaterThan(0.9);
    // …and no correlation between channels, nor between neighbouring dots.
    const correlation = (a: number[], b: number[]) => {
      const ma = mean(a);
      const mb = mean(b);
      let ab = 0;
      let aa = 0;
      let bb = 0;
      for (let index = 0; index < a.length; index += 1) {
        const da = (a[index] ?? 0) - ma;
        const db = (b[index] ?? 0) - mb;
        ab += da * db;
        aa += da * da;
        bb += db * db;
      }
      return ab / Math.sqrt(aa * bb);
    };
    expect(Math.abs(correlation(first, second))).toBeLessThan(0.03);
    expect(Math.abs(correlation(first.slice(1), first.slice(0, -1)))).toBeLessThan(0.03);
  });

  it("gathers the dots the hero shows into patches of streets, one for each particle kept for the plan", () => {
    const { particles, landing, side } = fieldFor(2400, 300);
    const { patches } = particles.flight;
    const extent = Array.from({ length: 300 }, () => ({ minX: 99, maxX: -99, minY: 99, maxY: -99, dots: 0 }));
    // Every dot is checked; the dots that break a rule are listed, then the list asserted empty
    // once (an assertion per dot made the test slower than the CI allows).
    const wrong: string[] = [];
    for (let index = 0; index < plan.count; index += 1) {
      const x = plan.place[index * 2] ?? 0;
      const y = plan.place[index * 2 + 1] ?? 0;
      const slot = landing[index * 2] ?? -1;
      // Every dot the hero shows lands as one of them, the others as none.
      if (shownAt(map.x + x * map.scale, map.y + y * map.scale) > 0) {
        if (!(slot >= 0 && slot < 300)) {
          wrong.push(`dot ${index} shown, lands as ${slot}`);
          continue;
        }
        const box = extent[slot];
        if (box) {
          box.minX = Math.min(box.minX, x);
          box.maxX = Math.max(box.maxX, x);
          box.minY = Math.min(box.minY, y);
          box.maxY = Math.max(box.maxY, y);
          box.dots += 1;
        }
        if (landing[index * 2 + 1] !== patches[slot * FLIGHT_PATCH_STRIDE + 3]) {
          wrong.push(`dot ${index} not in its patch's place (nucleus or orbit)`);
        }
      } else if (slot !== -1) {
        wrong.push(`dot ${index} not shown, lands as ${slot}`);
      }
    }
    expect(wrong.slice(0, 5)).toEqual([]);
    expect(wrong).toHaveLength(0);
    // Square patches, as many as there are particles for them, or nearly.
    const used = extent.filter((box) => box.dots > 0);
    expect(used.length).toBeLessThanOrEqual(300);
    expect(used.length).toBeGreaterThan(240);
    let nucleus = 0;
    for (const [slot, box] of extent.entries()) {
      const light = patches[slot * FLIGHT_PATCH_STRIDE + 2] ?? 0;
      if (box.dots === 0) {
        expect(light).toBe(0);
        continue;
      }
      expect(box.maxX - box.minX).toBeLessThan(side);
      expect(box.maxY - box.minY).toBeLessThan(side);
      // Each lands from its dots' centre of light, lit by them.
      const x = patches[slot * FLIGHT_PATCH_STRIDE] ?? 0;
      const y = patches[slot * FLIGHT_PATCH_STRIDE + 1] ?? 0;
      expect(x).toBeGreaterThanOrEqual(box.minX - 1e-6);
      expect(x).toBeLessThanOrEqual(box.maxX + 1e-6);
      expect(y).toBeGreaterThanOrEqual(box.minY - 1e-6);
      expect(y).toBeLessThanOrEqual(box.maxY + 1e-6);
      expect(light).toBeGreaterThan(0);
      expect(light).toBeLessThanOrEqual(1);
      nucleus += patches[slot * FLIGHT_PATCH_STRIDE + 3] ?? 0;
    }
    // A quarter of them land in the nucleus, and the heavy particles too.
    expect(nucleus / used.length).toBeGreaterThan(FLIGHT_NUCLEUS * 0.8);
    expect(nucleus / used.length).toBeLessThan(FLIGHT_NUCLEUS + 0.15);
    for (let slot = 0; slot < 300; slot += 1) {
      if ((particles.sizes[slot] ?? 0) >= 0.01) {
        expect(patches[slot * FLIGHT_PATCH_STRIDE + 3]).toBe(1);
      }
    }
  });

  it("packs only the dots the hero shows, each with the numbers it flies by", () => {
    const { landing } = fieldFor(2400, 300);
    const radius = new Float32Array(plan.count).fill(1.2);
    const route = new Float32Array(plan.count * FLIGHT_PACK_STRIDE);
    const timing = new Float32Array(plan.count * FLIGHT_PACK_STRIDE);
    const color = new Float32Array(plan.count * FLIGHT_PACK_STRIDE);
    const size = new Float32Array(plan.count);
    const packed = packFlight(plan.place, plan.look, radius, landing, flight(0), route, timing, color, size);
    const shown = Array.from({ length: plan.count }, (_, index) => index).filter(
      (index) => (landing[index * 2] ?? -1) >= 0,
    );
    expect(packed).toBe(shown.length);
    expect(packed).toBeLessThan(plan.count);
    const flown = { x: 0, y: 0, light: 0, plasma: 0 };
    const there = { x: 0, y: 0, light: 0, plasma: 0 };
    for (const [k, index] of shown.entries()) {
      if (k % 97 !== 0) {
        continue;
      }
      const slot = landing[index * 2] ?? -1;
      expect(route[k * FLIGHT_PACK_STRIDE]).toBe(plan.place[index * 2]);
      expect(route[k * FLIGHT_PACK_STRIDE + 2]).toBe(slot);
      expect(route[k * FLIGHT_PACK_STRIDE + 3]).toBe(landing[index * 2 + 1]);
      expect(size[k]).toBeCloseTo(1.2, 6);
      // Flown with the packed numbers, as the shader does, it goes where flightPoint flies it, as lit.
      const start = {
        x: map.x + (plan.place[index * 2] ?? 0) * map.scale,
        y: map.y + (plan.place[index * 2 + 1] ?? 0) * map.scale,
      };
      const target = towards(slot, { x: 0.9, y: 0.3 }, (landing[index * 2 + 1] ?? 0) > 0.5);
      for (const progress of [0, 0.4, 0.7, 0.95]) {
        flightPoint(start, index, target, flight(progress), flown);
        const leave = timing[k * FLIGHT_PACK_STRIDE] ?? 0;
        const land = timing[k * FLIGHT_PACK_STRIDE + 1] ?? 1;
        const t = Math.min(1, Math.max(0, (progress - leave) / (land - leave)));
        const p = t * t * t * (t * (t * 6 - 15) + 10);
        const aside = timing[k * FLIGHT_PACK_STRIDE + 2] ?? 0;
        const lift = (timing[k * FLIGHT_PACK_STRIDE + 3] ?? 0) * mark.radius;
        const cx = (start.x + target.x) / 2 - (target.y - start.y) * aside;
        const cy = (start.y + target.y) / 2 + (target.x - start.x) * aside + lift;
        there.x = (1 - p) ** 2 * start.x + 2 * (1 - p) * p * cx + p * p * target.x;
        there.y = (1 - p) ** 2 * start.y + 2 * (1 - p) * p * cy + p * p * target.y;
        const fused = Math.min(1, Math.max(0, (progress - (land - MERGE)) / MERGE));
        there.light = (color[k * FLIGHT_PACK_STRIDE + 3] ?? 0) * (1 - fused * fused * (3 - 2 * fused));
        expect(there.x).toBeCloseTo(flown.x, 5);
        expect(there.y).toBeCloseTo(flown.y, 5);
        expect(there.light).toBeCloseTo(flown.light * (plan.look[index * 4 + 3] ?? 0), 5);
      }
      expect(FLIGHT_LIFT).toBeGreaterThan(0);
    }
  });

  it("gathers and packs the plan a step at a time, to the same numbers, for the field to spread over frames", () => {
    const whole = fieldFor(2400, 300);
    const radius = new Float32Array(plan.count).fill(1.2);
    const packs = () =>
      [0, 0, 0, 0].map((_, k) => new Float32Array(plan.count * (k < 3 ? FLIGHT_PACK_STRIDE : 1)));
    const [route, timing, color, size] = packs() as [Float32Array, Float32Array, Float32Array, Float32Array];
    const packed = packFlight(
      plan.place,
      plan.look,
      radius,
      whole.landing,
      flight(0),
      route,
      timing,
      color,
      size,
    );
    // Step by step, other work between the steps…
    const particles = {
      ...createIonFieldLayout(2400),
      flight: {
        count: 300,
        patches: new Float32Array(300 * FLIGHT_PATCH_STRIDE),
        reveal: 1,
        landed: new Float32Array(300).fill(-1),
      },
    };
    const landing = new Float32Array(plan.count * 2);
    const [stepRoute, stepTiming, stepColor, stepSize] = packs() as [
      Float32Array,
      Float32Array,
      Float32Array,
      Float32Array,
    ];
    let pauses = 0;
    const run = <T>(steps: Generator<void, T, void>): T => {
      for (;;) {
        const step = steps.next();
        if (step.done) {
          return step.value;
        }
        pauses += 1;
        new Float32Array(64).fill(pauses);
      }
    };
    const side = run(gatherFlightSteps(plan.place, plan.look, flight(0), particles, landing));
    const gatherPauses = pauses;
    const stepPacked = run(
      packFlightSteps(
        plan.place,
        plan.look,
        radius,
        landing,
        flight(0),
        stepRoute,
        stepTiming,
        stepColor,
        stepSize,
      ),
    );
    // …the same numbers, bit for bit (the first float that differs: none)…
    const differsAt = (a: Float32Array, b: Float32Array) => {
      const bitsA = new Uint32Array(a.buffer, a.byteOffset, a.length);
      const bitsB = new Uint32Array(b.buffer, b.byteOffset, b.length);
      return a.length !== b.length ? 0 : bitsA.findIndex((bits, index) => bits !== bitsB[index]);
    };
    expect(side).toBe(whole.side);
    expect(differsAt(landing, whole.landing)).toBe(-1);
    expect(differsAt(particles.flight.patches, whole.particles.flight.patches)).toBe(-1);
    expect(stepPacked).toBe(packed);
    expect(
      [
        [stepRoute, route],
        [stepTiming, timing],
        [stepColor, color],
        [stepSize, size],
      ].map(([a, b]) => differsAt(a ?? new Float32Array(1), b ?? new Float32Array(0))),
    ).toEqual([-1, -1, -1, -1]);
    // …pausing every FLIGHT_GATHER_STEP dots at least, through each pass over the plan.
    expect(gatherPauses).toBeGreaterThanOrEqual(3 * Math.floor((plan.count - 1) / FLIGHT_GATHER_STEP));
    expect(pauses - gatherPauses).toBe(Math.floor((plan.count - 1) / FLIGHT_GATHER_STEP));
  });

  it("keeps no patch when the field keeps no particle for the plan, or the hero shows none of it", () => {
    const landing = new Float32Array(plan.count * 2);
    const none = {
      ...createIonFieldLayout(200),
      flight: { count: 0, patches: new Float32Array(0), reveal: 1, landed: new Float32Array(0) },
    };
    expect(gatherFlight(plan.place, plan.look, flight(0), none, landing)).toBe(0);
    expect(landing.every((value, index) => value === (index % 2 === 0 ? -1 : 0))).toBe(true);
    const away = { ...flight(0), hero: { top: -5, height: 1, left: 10, right: 12 } };
    const { particles } = fieldFor(200, 20);
    expect(gatherFlight(plan.place, plan.look, away, particles, landing)).toBe(0);
    expect(particles.flight.patches.every((value) => value === 0)).toBe(true);
  });

  it("leaves every dot where the plan painted it until the page scrolls", () => {
    for (const [index, start] of starts.entries()) {
      for (const target of [towards(index, mark), towards(9999, { x: 0.3, y: 0.2 }, true)]) {
        flightPoint(start, index, target, flight(0), out);
        expect(out.x).toBeCloseTo(start.x, 9);
        expect(out.y).toBeCloseTo(start.y, 9);
        expect(out.light).toBe(1);
        expect(out.plasma).toBe(0);
      }
    }
  });

  it("glides after the scroll, as the field's particles follow their shapes, whatever the wheel's steps", () => {
    // A wheel notch moves the page at once: the plan follows it smoothly, without a jump.
    const motion = { progress: 0, speed: 0 };
    let previous = 0;
    let reached = Number.POSITIVE_INFINITY;
    for (let frame = 1; frame <= 120; frame += 1) {
      followFlight(motion, 0.6, 1 / 60);
      expect(motion.progress).toBeGreaterThanOrEqual(previous);
      expect(motion.progress - previous).toBeLessThan(0.03);
      expect(motion.progress).toBeLessThanOrEqual(0.6);
      if (motion.progress > 0.57 && reached === Number.POSITIVE_INFINITY) {
        reached = frame / 60;
      }
      previous = motion.progress;
    }
    // It takes its time, as the rivers do, but gets there.
    expect(reached).toBeGreaterThan(0.4);
    expect(reached).toBeLessThan(1.2);
    // At rest, it rests; and it follows the same way however long the frames.
    const still = { progress: 0.3, speed: 0 };
    followFlight(still, 0.3, 1 / 60);
    expect(still.progress).toBe(0.3);
    const fine = { progress: 0, speed: 0 };
    const coarse = { progress: 0, speed: 0 };
    for (let frame = 0; frame < 24; frame += 1) {
      followFlight(coarse, 1, 1 / 24);
      for (let step = 0; step < 10; step += 1) {
        followFlight(fine, 1, 1 / 240);
      }
    }
    expect(coarse.progress).toBeCloseTo(fine.progress, 6);
  });

  it("lifts each dot off its street gently, then lands it softly", () => {
    const start = { x: -0.6, y: -0.3 };
    const target = towards(11, mark);
    for (const dot of dots) {
      // When it leaves and when it lands, as the flight goes.
      let leave = -1;
      for (let progress = 0; progress <= 1; progress += 0.0005) {
        flightPoint(start, dot, target, flight(progress), out);
        if (leave < 0 && Math.hypot(out.x - start.x, out.y - start.y) > 1e-9) {
          leave = progress;
        }
      }
      const land = 0.85 + 0.15 * flightRandom(11, 1);
      const way = Math.hypot(mark.x - start.x, mark.y - start.y);
      // A tenth of the way through its flight, it has hardly left its street…
      flightPoint(start, dot, target, flight(leave + 0.1 * (land - leave)), out);
      expect(Math.hypot(out.x - start.x, out.y - start.y)).toBeLessThan(0.02 * way);
      // …and a tenth before it lands, it is all but there.
      flightPoint(start, dot, target, flight(land - 0.1 * (land - leave)), out);
      expect(Math.hypot(out.x - mark.x, out.y - mark.y)).toBeLessThan(0.02 * way);
    }
  });

  it("lets the plan flow from the bottom of the hero up as soon as the page scrolls, with the rivers", () => {
    const foot = { x: 0.2, y: -1.15 };
    const top = { x: 0.2, y: 1.15 };
    // Early in the scroll: a quarter of the way up the wave.
    const early = FLIGHT_RISE / 4;
    for (const dot of dots) {
      const target = towards(dot, mark);
      // At rest, not a dot moves…
      for (const start of [foot, top]) {
        flightPoint(start, dot, target, flight(0), out);
        expect(out.x).toBeCloseTo(start.x, 9);
        expect(out.y).toBeCloseTo(start.y, 9);
      }
      // …from the first scroll the foot of the plan flows, while its top waits…
      flightPoint(foot, dot, target, flight(early), out);
      expect(Math.hypot(out.x - foot.x, out.y - foot.y)).toBeGreaterThan(1e-4);
      flightPoint(top, dot, target, flight(early), out);
      expect(out.x).toBeCloseTo(top.x, 9);
      expect(out.y).toBeCloseTo(top.y, 9);
      // …and follows, well before the end.
      flightPoint(top, dot, target, flight(0.6), out);
      expect(Math.hypot(out.x - top.x, out.y - top.y)).toBeGreaterThan(1e-4);
    }
  });

  it("keeps the plan on its way, every dot lit, as long as the rivers' particles are", () => {
    const lit = (progress: number) => {
      let count = 0;
      for (const [index, start] of starts.entries()) {
        flightPoint(start, index, towards(index + 5000, mark), flight(progress), out);
        count += out.light > 0.5 ? 1 : 0;
      }
      return count / starts.length;
    };
    expect(lit(0.5)).toBe(1);
    // Three quarters of the way, the rivers are still on theirs: so is the plan.
    expect(lit(0.75)).toBe(1);
    // It lands as the rivers' particles reach the mark.
    expect(lit(0.92)).toBeLessThan(0.7);
    expect(lit(1)).toBe(0);
  });

  it("fuses each patch of streets into its particle, wherever that one stands", () => {
    const members = [
      { x: -0.7, y: 0.1 },
      { x: -0.68, y: 0.11 },
      { x: -0.72, y: 0.08 },
      { x: -0.69, y: 0.13 },
    ];
    // Where the particle stands as they land, pushed aside by the pointer, say.
    for (const at of [
      { x: 0.95, y: 0.3 },
      { x: 1.02, y: 0.36 },
    ]) {
      for (const [offset, start] of members.entries()) {
        const index = 100 + offset;
        // On their way, each dot of the patch flies its own curve…
        flightPoint(start, index, towards(42, at), flight(0.5), out);
        expect(out.light).toBe(1);
        // …and they all land on the particle, fusing into it.
        flightPoint(start, index, towards(42, at), flight(1), out);
        expect(out.x).toBeCloseTo(at.x, 9);
        expect(out.y).toBeCloseTo(at.y, 9);
        expect(out.light).toBe(0);
      }
    }
  });

  it("leaves nothing of the plan beside the field once landed, even as the mark gives way to the next shapes", () => {
    // Reported: as the mark left for the cards, the plan's points stayed behind, apart, then
    // faded. Landed, every dot has fused into a particle of the field: none is drawn on its own.
    for (const presence of [1, 0.5, 0]) {
      for (const [index, start] of starts.entries()) {
        flightPoint(start, index, towards(index, mark), flight(1, { presence }), out);
        expect(out.light).toBe(0);
      }
    }
  });

  it("keeps the plan's particles unseen, in the mark, until their patch lands, then lights them as its own", () => {
    const { particles } = fieldFor(2400, 300);
    const { patches } = particles.flight;
    const rivers = { weight: 1, box: flight(0).box };
    for (const progress of [0, 0.5, FLIGHT_LANDING - FLIGHT_MERGE]) {
      // The rivers hold the field's own particles; the plan's stand unseen in the mark.
      const { targets, looks } = write(particles, { rivers, flight: flight(progress) });
      for (let index = 0; index < 300; index += 1) {
        expect(targets[index * FORMATION_STRIDE + 2]).toBe(1);
        expect(looks[index * FORMATION_STRIDE + 2]).toBe(0);
        const fromCentre =
          Math.hypot(
            (targets[index * FORMATION_STRIDE] ?? 0) - mark.x,
            (targets[index * FORMATION_STRIDE + 1] ?? 0) - mark.y,
          ) / mark.radius;
        expect(fromCentre).toBeLessThan(1.05);
      }
    }
    const { targets, looks } = write(particles, { flight: flight(1) });
    let lit = 0;
    let inNucleus = 0;
    for (let index = 0; index < 300; index += 1) {
      const light = patches[index * FLIGHT_PATCH_STRIDE + 2] ?? 0;
      const glow = looks[index * FORMATION_STRIDE + 2] ?? 0;
      if (light === 0) {
        // No patch: it stays unseen.
        expect(glow).toBe(0);
        continue;
      }
      lit += 1;
      const point = {
        x: targets[index * FORMATION_STRIDE] ?? 0,
        y: targets[index * FORMATION_STRIDE + 1] ?? 0,
      };
      // Lit as the mark's own: no brighter than its brightest.
      expect(glow).toBeGreaterThan(0);
      expect(glow).toBeLessThanOrEqual(1.3);
      if ((patches[index * FLIGHT_PATCH_STRIDE + 3] ?? 0) > 0.5) {
        inNucleus += 1;
        expect(looks[index * FORMATION_STRIDE + 1]).toBeCloseTo(0.9, 6);
        expect(Math.hypot(point.x - mark.x, point.y - mark.y) / mark.radius).toBeLessThanOrEqual(0.27);
      } else {
        expect(looks[index * FORMATION_STRIDE + 3]).toBeCloseTo(0.85, 6);
        const { away } = inOrbitPlane(point);
        expect(away).toBeGreaterThanOrEqual(1 - FLIGHT_ORBIT_WIDTH / 2 - 1e-6);
        expect(away).toBeLessThanOrEqual(1 + FLIGHT_ORBIT_WIDTH / 2 + 1e-6);
      }
    }
    expect(lit).toBeGreaterThan(240);
    expect(inNucleus).toBeGreaterThan(0);
  });

  it("lands each patch on the side of the mark it comes from, then spreads them all along its orbit", () => {
    const { particles } = fieldFor(2400, 300);
    const { patches } = particles.flight;
    const onOrbit = Array.from({ length: 300 }, (_, index) => index).filter(
      (index) =>
        (patches[index * FLIGHT_PATCH_STRIDE + 2] ?? 0) > 0 &&
        (patches[index * FLIGHT_PATCH_STRIDE + 3] ?? 0) < 0.5,
    );
    expect(onOrbit.length).toBeGreaterThan(150);
    /** Where a target stands along the orbit, as a fraction of its length. */
    const arc = (targets: Float32Array, index: number) =>
      orbitArc(
        inOrbitPlane({
          x: targets[index * FORMATION_STRIDE] ?? 0,
          y: targets[index * FORMATION_STRIDE + 1] ?? 0,
        }).angle,
      );
    const apart = (a: number, b: number) => Math.abs(a - b - Math.round(a - b));
    /** How many of them stand in each sixth of the orbit. */
    const sixths = (targets: Float32Array) => {
      const counts = new Array<number>(6).fill(0);
      for (const index of onOrbit) {
        const sixth = Math.floor(arc(targets, index) * 6) % 6;
        counts[sixth] = (counts[sixth] ?? 0) + 1;
      }
      return counts;
    };
    const time = 10;
    // As they land, each near the side its patch comes from: bunched on the plan's side.
    const landing = write(particles, { flight: flight(1) }, time).targets;
    for (const index of onOrbit) {
      const from = inOrbitPlane({
        x: map.x + (patches[index * FLIGHT_PATCH_STRIDE] ?? 0) * map.scale,
        y: map.y + (patches[index * FLIGHT_PATCH_STRIDE + 1] ?? 0) * map.scale,
      });
      // Within its scatter of that side, along the orbit, turned as the mark has.
      const lowest = orbitArc(from.angle - FLIGHT_SCATTER) + time * FLIGHT_ORBIT_SPIN;
      const highest = orbitArc(from.angle + FLIGHT_SCATTER) + time * FLIGHT_ORBIT_SPIN;
      const forward = (value: number) => value - Math.floor(value);
      expect(forward(arc(landing, index) - lowest)).toBeLessThanOrEqual(forward(highest - lowest) + 1e-5);
    }
    const mean = onOrbit.length / 6;
    expect(Math.max(...sixths(landing))).toBeGreaterThan(2 * mean);
    // Then each goes its own way along the orbit, until they line it as evenly as its dust.
    const spread = write(particles, { flight: flight(1) }, time + FLIGHT_SPREAD).targets;
    for (const count of sixths(spread)) {
      expect(count).toBeGreaterThan(0.6 * mean);
      expect(count).toBeLessThan(1.4 * mean);
    }
    // And they turn with the mark, as its dust does.
    const later = write(particles, { flight: flight(1) }, time + FLIGHT_SPREAD + 2).targets;
    for (const index of onOrbit) {
      expect(apart(arc(later, index), arc(spread, index) + 2 * FLIGHT_ORBIT_SPIN)).toBeLessThan(1e-4);
      const before = inOrbitPlane({
        x: spread[index * FORMATION_STRIDE] ?? 0,
        y: spread[index * FORMATION_STRIDE + 1] ?? 0,
      });
      const after = inOrbitPlane({
        x: later[index * FORMATION_STRIDE] ?? 0,
        y: later[index * FORMATION_STRIDE + 1] ?? 0,
      });
      expect(after.away).toBeCloseTo(before.away, 5);
    }
  });

  it("gathers them back where they landed as the page scrolls back and the plan comes out of them", () => {
    const { particles } = fieldFor(2400, 300);
    const time = 10 + FLIGHT_SPREAD;
    // Landed a while ago, they have spread…
    write(particles, { flight: flight(1) }, 10);
    const spread = write(particles, { flight: flight(1) }, time).targets;
    // …the page scrolls back: the dots come out of them, and they stand where they landed (as the
    // mark has turned meanwhile), as when they land anew.
    const back = write(particles, { flight: flight(0.5) }, time).targets;
    const anew = write(particles, { flight: flight(1) }, time).targets;
    let moved = 0;
    for (let index = 0; index < 300; index += 1) {
      const offset = index * FORMATION_STRIDE;
      expect(back[offset]).toBeCloseTo(anew[offset] ?? 0, 6);
      expect(back[offset + 1]).toBeCloseTo(anew[offset + 1] ?? 0, 6);
      const gone = Math.hypot(
        (back[offset] ?? 0) - (spread[offset] ?? 0),
        (back[offset + 1] ?? 0) - (spread[offset + 1] ?? 0),
      );
      moved += gone > 0.01 ? 1 : 0;
    }
    expect(moved).toBeGreaterThan(200);
  });

  it("hands the plan's particles on to the next shapes with the others, lit as they are", () => {
    const { particles } = fieldFor(2400, 300);
    const { patches } = particles.flight;
    const card = { weight: 1, box, radius: 0.07, step: 0 };
    // The mark has given way to the cards: the plan's particles trace them with the field's own.
    const { targets, looks } = write(particles, { flight: flight(1, { presence: 0 }), card });
    const own = write(createIonFieldLayout(2400), { card });
    for (let index = 0; index < 300; index += 1) {
      const offset = index * FORMATION_STRIDE;
      expect(targets[offset + 2]).toBe(1);
      const distance = distanceToRoundedBox(targets[offset] ?? 0, targets[offset + 1] ?? 0, 0.07);
      expect(distance).toBeGreaterThan(0);
      expect(distance).toBeLessThan(0.25);
      const light = patches[index * FLIGHT_PATCH_STRIDE + 2] ?? 0;
      expect(looks[offset + 2]).toBeLessThanOrEqual((own.looks[offset + 2] ?? 0) * light + 1e-6);
      expect(looks[offset]).toBeCloseTo(own.looks[offset] ?? 0, 6);
    }
    // Halfway, they go over with the others: still held, each in the mark or round the cards.
    const half = write(particles, { flight: flight(1, { presence: 0.5 }), card: { ...card, weight: 0.5 } });
    const mark = write(particles, { flight: flight(1) });
    let over = 0;
    for (let index = 0; index < 300; index += 1) {
      const offset = index * FORMATION_STRIDE;
      expect(half.targets[offset + 2]).toBe(1);
      const x = half.targets[offset] ?? 0;
      const inCards = Math.abs(x - (targets[offset] ?? 0)) < 1e-5;
      expect(inCards || Math.abs(x - (mark.targets[offset] ?? 0)) < 1e-5).toBe(true);
      over += inCards ? 1 : 0;
    }
    expect(over / 300).toBeCloseTo(0.5, 1);
  });

  it("brings the plan's particles up gently once the field has the plan", () => {
    const { particles } = fieldFor(2400, 300);
    const lit = write(particles, { flight: flight(1) }).looks;
    const dim = write(
      { ...particles, flight: { ...particles.flight, reveal: 0.25 } },
      { flight: flight(1) },
    ).looks;
    for (let index = 0; index < 300; index += 1) {
      expect(dim[index * FORMATION_STRIDE + 2]).toBeCloseTo(
        (lit[index * FORMATION_STRIDE + 2] ?? 0) * 0.25,
        6,
      );
    }
  });

  it("flows in streams: the dots of a patch fly the same way, each a little off the others, without a jump", () => {
    const other = { x: 0, y: 0, light: 0, plasma: 0 };
    const left = { x: mark.x - mark.radius, y: mark.y };
    const right = { x: mark.x + mark.radius, y: mark.y };
    let neighbours = 0;
    let strangers = 0;
    for (const dot of dots) {
      const start = { x: -1.5 + (dot % 20) * 0.14, y: -0.5 + Math.floor(dot / 20) * 0.07 };
      flightPoint(start, dot, towards(7, left), flight(0.6), out);
      // A dot of the same patch, a few pixels away…
      const near = { x: start.x + 0.01, y: start.y };
      flightPoint(near, dot + 1000, towards(7, left), flight(0.6), other);
      neighbours += Math.hypot(out.x - other.x, out.y - other.y);
      // …and one from the other side of the plan, bound elsewhere.
      const far = { x: -start.x * 0.5, y: 0.6 - start.y };
      flightPoint(far, dot + 2000, towards(8, right), flight(0.6), other);
      strangers += Math.hypot(out.x - other.x, out.y - other.y);
    }
    expect(neighbours / dots.length).toBeGreaterThan(0.02);
    expect(neighbours / strangers).toBeLessThan(0.35);
    for (const dot of dots) {
      const start = { x: -0.6, y: -0.3 };
      let previous = { x: start.x, y: start.y };
      for (let progress = 0; progress <= 1.0001; progress += 0.01) {
        flightPoint(start, dot, towards(dot, left), flight(progress), out);
        expect(Math.hypot(out.x - previous.x, out.y - previous.y)).toBeLessThan(0.12);
        previous = { x: out.x, y: out.y };
      }
    }
  });

  it("makes way for the pointer on its way, as the field's particles do, not at rest nor once landed", () => {
    const start = { x: -0.6, y: -0.3 };
    const target = towards(3, mark);
    const free = { x: 0, y: 0, light: 0, plasma: 0 };
    let pushed = 0;
    for (const dot of dots) {
      // Where it would be without the pointer, and the pointer right beside it.
      flightPoint(start, dot, target, flight(0.6), free);
      const pointer = { x: free.x + 0.03, y: free.y, strength: 1 };
      flightPoint(start, dot, target, flight(0.6), out, pointer);
      const before = Math.hypot(free.x - pointer.x, free.y - pointer.y);
      const after = Math.hypot(out.x - pointer.x, out.y - pointer.y);
      if (after > before + 0.005) {
        pushed += 1;
      }
      expect(after).toBeGreaterThanOrEqual(before - 1e-9);
      // Away from it, it flies its own way.
      flightPoint(start, dot, target, flight(0.6), out, { x: free.x + 0.6, y: free.y, strength: 1 });
      expect(Math.hypot(out.x - free.x, out.y - free.y)).toBeLessThan(1e-6);
      // At rest it stays as painted, and it lands right on its particle.
      flightPoint(start, dot, target, flight(0), out, { x: start.x + 0.03, y: start.y, strength: 1 });
      expect(out.x).toBeCloseTo(start.x, 9);
      expect(out.y).toBeCloseTo(start.y, 9);
      flightPoint(start, dot, target, flight(1), out, { x: mark.x + 0.03, y: mark.y, strength: 1 });
      expect(out.x).toBeCloseTo(mark.x, 9);
      expect(out.y).toBeCloseTo(mark.y, 9);
    }
    expect(pushed / dots.length).toBeGreaterThan(0.9);
  });

  it("rises from below the mark", () => {
    const start = { x: 0.5, y: -0.4 };
    let risen = 0;
    for (const dot of dots) {
      flightPoint(start, dot, towards(dot, mark), flight(0.5), out);
      if (out.y > start.y + 0.05) {
        risen += 1;
      }
    }
    expect(risen / dots.length).toBeGreaterThan(0.9);
  });

  it("flies only the dots the plan's canvas shows, fading out at the hero's foot as it does", () => {
    for (const progress of [0, 0.3]) {
      // Above the hero, beyond its sides: never shown.
      for (const start of [
        { x: 0, y: 1.3 },
        { x: -1.9, y: 0 },
        { x: 1.85, y: 0 },
      ]) {
        flightPoint(start, 1, towards(1, mark), flight(progress), out);
        expect(out.light).toBe(0);
      }
      // Nor those with no particle to land as.
      flightPoint({ x: 0, y: 0 }, 1, null, flight(progress), out);
      expect(out.light).toBe(0);
    }
    // Halfway down the hero's foot, half lit.
    const foot = { x: -1, y: 1.2 - 0.86 * 2.4 };
    flightPoint(foot, 1, towards(1, mark), flight(0), out);
    expect(out.light).toBeCloseTo(0.5, 6);
  });

  it("never loses a dot or a particle, even to a mark of no size", () => {
    const start = { x: 0.2, y: 0.3 };
    flightPoint(start, 5, towards(5, mark), flight(0.5, { radius: 0 }), out);
    expect(Number.isFinite(out.x) && Number.isFinite(out.y) && Number.isFinite(out.light)).toBe(true);
    const { particles } = fieldFor(400, 40);
    const { targets, looks } = write(particles, { flight: flight(1, { radius: 0 }) });
    expect([...targets, ...looks].every(Number.isFinite)).toBe(true);
  });
});
