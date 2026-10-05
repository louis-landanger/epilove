import { describe, expect, it } from "vitest";
import {
  fieldOfViewFor,
  MOLECULE,
  MOLECULE_CAMERA,
  moleculePose,
  project,
  ringPoint,
  type Vec3,
} from "./pose";

const length = (v: Vec3) => Math.hypot(v.x, v.y, v.z);
const dot = (a: Vec3, b: Vec3) => a.x * b.x + a.y * b.y + a.z * b.z;
const distance = (a: Vec3, b: Vec3) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

describe("moleculePose", () => {
  it("is the same pose for the same time (the poster and the live scene agree)", () => {
    expect(moleculePose(0)).toEqual(moleculePose(0));
    expect(moleculePose(2.5)).toEqual(moleculePose(2.5));
    expect(moleculePose(0)).not.toEqual(moleculePose(2.5));
  });

  it("keeps every ring an orthonormal frame with the electron on it", () => {
    for (const time of [0, 1.7, 13.2]) {
      for (const atom of moleculePose(time).atoms) {
        for (const ring of atom.rings) {
          expect(length(ring.u)).toBeCloseTo(1, 6);
          expect(length(ring.v)).toBeCloseTo(1, 6);
          expect(length(ring.normal)).toBeCloseTo(1, 6);
          expect(dot(ring.u, ring.v)).toBeCloseTo(0, 6);
          expect(dot(ring.u, ring.normal)).toBeCloseTo(0, 6);
          expect(distance(ringPoint(ring, ring.electron), atom.center)).toBeCloseTo(ring.radius, 6);
        }
      }
    }
  });

  it("interlocks the two orbits without either crossing the other nucleus", () => {
    const { atoms } = moleculePose(0);
    const [a, b] = atoms;
    const apart = distance(a.center, b.center);
    expect(apart).toBeLessThan((a.rings[0]?.radius ?? 0) + (b.rings[0]?.radius ?? 0));
    expect(apart - (b.rings[0]?.radius ?? 0)).toBeGreaterThan(a.nucleus * 1.5);
    expect(apart - (a.rings[0]?.radius ?? 0)).toBeGreaterThan(b.nucleus * 1.5);
  });

  it("precesses the rings and moves the electrons over time", () => {
    const before = moleculePose(0).atoms[0].rings[0];
    const after = moleculePose(3).atoms[0].rings[0];
    expect(before).toBeDefined();
    expect(after).toBeDefined();
    if (!before || !after) {
      return;
    }
    expect(distance(before.normal, after.normal)).toBeGreaterThan(0.05);
    expect(after.electron - before.electron).toBeCloseTo(3 * (MOLECULE.atoms[0].rings[0]?.speed ?? 0), 9);
  });

  it("runs the sparks along the bond, lit between the two nuclei", () => {
    for (const time of [0, 0.8, 4.3]) {
      const { bond, sparks } = moleculePose(time);
      expect(sparks).toHaveLength(MOLECULE.sparks);
      for (const spark of sparks) {
        expect(spark.along).toBeGreaterThanOrEqual(0);
        expect(spark.along).toBeLessThanOrEqual(1);
        expect(spark.light).toBeGreaterThanOrEqual(0);
        expect(spark.light).toBeLessThanOrEqual(1);
        // On the bond, give or take the wobble across it.
        const expected = {
          x: bond.from.x + (bond.to.x - bond.from.x) * spark.along,
          y: bond.from.y + (bond.to.y - bond.from.y) * spark.along,
          z: bond.from.z + (bond.to.z - bond.from.z) * spark.along,
        };
        expect(distance(spark.position, expected)).toBeLessThan(0.06);
      }
    }
  });

  it("fits the projected molecule in the unit square, nuclei and orbits included", () => {
    for (const time of [0, 2, 7.5]) {
      for (const atom of moleculePose(time).atoms) {
        for (const ring of atom.rings) {
          for (let step = 0; step < 48; step += 1) {
            const point = project(ringPoint(ring, (step / 48) * Math.PI * 2));
            expect(Math.abs(point.x)).toBeLessThan(1);
            expect(Math.abs(point.y)).toBeLessThan(1);
          }
        }
      }
    }
  });
});

describe("project", () => {
  it("sends the origin to the centre and scales with the camera's focal length", () => {
    const origin = project({ x: 0, y: 0, z: 0 });
    expect(origin.x).toBe(0);
    expect(origin.y).toBe(0);
    const focal = 1 / Math.tan((MOLECULE_CAMERA.fov * Math.PI) / 360);
    expect(origin.scale).toBeCloseTo(focal / MOLECULE_CAMERA.distance, 9);
    // Nearer points look bigger.
    expect(project({ x: 0, y: 0, z: 0.5 }).scale).toBeGreaterThan(origin.scale);
    expect(project({ x: 0, y: 0, z: -0.5 }).scale).toBeLessThan(origin.scale);
  });
});

describe("fieldOfViewFor", () => {
  it("keeps the camera's field of view on landscape stages and widens it on portrait ones", () => {
    expect(fieldOfViewFor(1)).toBeCloseTo(MOLECULE_CAMERA.fov, 9);
    expect(fieldOfViewFor(1.8)).toBeCloseTo(MOLECULE_CAMERA.fov, 9);
    const portrait = fieldOfViewFor(0.5);
    expect(portrait).toBeGreaterThan(MOLECULE_CAMERA.fov);
    // Twice the half-height tangent: the unit square's width now fits the stage's width.
    expect(Math.tan((portrait * Math.PI) / 360)).toBeCloseTo(
      2 * Math.tan((MOLECULE_CAMERA.fov * Math.PI) / 360),
      9,
    );
  });
});
