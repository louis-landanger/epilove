/**
 * The hero's molecule (docs/02-design.md, moment 1): two atoms, plasma and
 * volt, their orbits interlocked, a bond of light between the two nuclei.
 * Pure geometry, no three.js: the static SVG poster (rendered on the server)
 * and the live scene draw the same pose, so the live scene takes over from
 * the poster without a jump.
 *
 * Space: molecule units, y up, z towards the viewer. The camera sits on the
 * z axis (`MOLECULE_CAMERA`) and the molecule fits the square [-1, 1]² once
 * projected.
 */

export interface Vec3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export type MoleculeTone = "plasma" | "volt";

/** Camera on the z axis looking at the origin: its distance and vertical field of view (degrees). */
export const MOLECULE_CAMERA = { distance: 4.5, fov: 30 } as const;

const FOCAL = 1 / Math.tan((MOLECULE_CAMERA.fov * Math.PI) / 360);
const TAU = Math.PI * 2;

export interface RingSpec {
  /** Rotation of the ring's major axis in the picture plane (radians). */
  readonly turn: number;
  /** Tilt of the ring out of the picture plane, about its major axis (radians). */
  readonly tilt: number;
  /** The electron's angular speed (radians per second, negative clockwise) and starting angle. */
  readonly speed: number;
  readonly phase: number;
}

export interface AtomSpec {
  readonly tone: MoleculeTone;
  readonly center: Vec3;
  /** Radius of the nucleus. */
  readonly nucleus: number;
  /** Radius of the orbits. */
  readonly orbit: number;
  readonly rings: ReadonlyArray<RingSpec>;
  /** The rings precess together about this axis (unit vector) at this speed (radians per second). */
  readonly spinAxis: Vec3;
  readonly spin: number;
}

const unit = (x: number, y: number, z: number): Vec3 => {
  const length = Math.hypot(x, y, z) || 1;
  return { x: x / length, y: y / length, z: z / length };
};

/**
 * Two atoms on a diagonal, the plasma one bottom left and the volt one top
 * right, close enough for their orbits to interlock ("atomes crochus") and
 * far enough for no orbit to cross the other nucleus. Three rings each, 120°
 * apart and steeply tilted (the classic atom), precessing so the ellipses
 * keep changing shape; the electrons run opposite ways on the two atoms.
 */
export const MOLECULE = {
  /** The whole molecule is seen a little from above and from the left. */
  tilt: { x: 0.2, y: -0.12 },
  atoms: [
    {
      tone: "plasma",
      center: { x: -0.45, y: -0.16, z: 0.04 },
      nucleus: 0.135,
      orbit: 0.64,
      rings: [
        { turn: 0.35, tilt: 1.19, speed: 0.95, phase: 0.4 },
        { turn: 0.35 + TAU / 3, tilt: 1.19, speed: 1.2, phase: 2.5 },
        { turn: 0.35 + (2 * TAU) / 3, tilt: 1.19, speed: 1.45, phase: 4.4 },
      ],
      spinAxis: unit(0.35, 1, 0.15),
      spin: 0.11,
    },
    {
      tone: "volt",
      center: { x: 0.46, y: 0.2, z: -0.04 },
      nucleus: 0.115,
      orbit: 0.55,
      rings: [
        { turn: -0.25, tilt: 1.15, speed: -1.05, phase: 1.1 },
        { turn: -0.25 + TAU / 3, tilt: 1.15, speed: -1.3, phase: 3.3 },
        { turn: -0.25 + (2 * TAU) / 3, tilt: 1.15, speed: -1.55, phase: 5.2 },
      ],
      spinAxis: unit(-0.3, 1, -0.2),
      spin: -0.13,
    },
  ],
  /** Sparks exchanged along the bond, and the length of the electrons' trails (radians of orbit). */
  sparks: 7,
  trail: 1,
} as const satisfies {
  readonly tilt: { readonly x: number; readonly y: number };
  readonly atoms: readonly [AtomSpec, AtomSpec];
  readonly sparks: number;
  readonly trail: number;
};

export interface RingPose {
  readonly center: Vec3;
  /** Orthonormal basis of the ring's plane: a point of the ring is `center + radius * (u cos a + v sin a)`. */
  readonly u: Vec3;
  readonly v: Vec3;
  /** `u × v`, towards the viewer when the ring is seen from its front. */
  readonly normal: Vec3;
  readonly radius: number;
  /** Angle of the electron on the ring (radians). */
  readonly electron: number;
}

export interface AtomPose {
  readonly tone: MoleculeTone;
  readonly center: Vec3;
  readonly nucleus: number;
  readonly rings: ReadonlyArray<RingPose>;
}

export interface Spark {
  readonly position: Vec3;
  /** Where along the bond, 0 at the plasma nucleus and 1 at the volt one: its colour. */
  readonly along: number;
  /** Brightness in [0, 1]: sparks light up as they leave a nucleus and fade as they reach the other. */
  readonly light: number;
}

export interface MoleculePose {
  readonly atoms: readonly [AtomPose, AtomPose];
  /** The bond of light, from the plasma nucleus to the volt one. */
  readonly bond: { readonly from: Vec3; readonly to: Vec3 };
  readonly sparks: ReadonlyArray<Spark>;
}

const rotateX = (p: Vec3, angle: number): Vec3 => {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return { x: p.x, y: p.y * c - p.z * s, z: p.y * s + p.z * c };
};

const rotateY = (p: Vec3, angle: number): Vec3 => {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return { x: p.x * c + p.z * s, y: p.y, z: -p.x * s + p.z * c };
};

const rotateZ = (p: Vec3, angle: number): Vec3 => {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return { x: p.x * c - p.y * s, y: p.x * s + p.y * c, z: p.z };
};

/** Rodrigues' rotation of `p` about the unit vector `axis`. */
const rotateAbout = (p: Vec3, axis: Vec3, angle: number): Vec3 => {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const dot = axis.x * p.x + axis.y * p.y + axis.z * p.z;
  return {
    x: p.x * c + (axis.y * p.z - axis.z * p.y) * s + axis.x * dot * (1 - c),
    y: p.y * c + (axis.z * p.x - axis.x * p.z) * s + axis.y * dot * (1 - c),
    z: p.z * c + (axis.x * p.y - axis.y * p.x) * s + axis.z * dot * (1 - c),
  };
};

const cross = (a: Vec3, b: Vec3): Vec3 => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
});

/** The molecule's own tilt, applied last to every point and direction. */
const view = (p: Vec3): Vec3 => rotateY(rotateX(p, MOLECULE.tilt.x), MOLECULE.tilt.y);

function ringPose(atom: AtomSpec, ring: RingSpec, center: Vec3, time: number): RingPose {
  const spin = atom.spin * time;
  // A circle in the picture plane, tilted about its major axis, turned, then carried by the precession.
  let u: Vec3 = { x: 1, y: 0, z: 0 };
  let v: Vec3 = rotateX({ x: 0, y: 1, z: 0 }, ring.tilt);
  u = rotateZ(u, ring.turn);
  v = rotateZ(v, ring.turn);
  u = view(rotateAbout(u, atom.spinAxis, spin));
  v = view(rotateAbout(v, atom.spinAxis, spin));
  return {
    center,
    u,
    v,
    normal: cross(u, v),
    radius: atom.orbit,
    electron: ring.phase + ring.speed * time,
  };
}

const fract = (value: number) => value - Math.floor(value);

/** The molecule at `time` seconds (0 for the poster). */
export function moleculePose(time: number): MoleculePose {
  const [specA, specB] = MOLECULE.atoms;
  const atoms = [specA, specB].map((atom): AtomPose => {
    const center = view(atom.center);
    return {
      tone: atom.tone,
      center,
      nucleus: atom.nucleus,
      rings: atom.rings.map((ring) => ringPose(atom, ring, center, time)),
    };
  }) as [AtomPose, AtomPose];

  const from = atoms[0].center;
  const to = atoms[1].center;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dz = to.z - from.z;
  // Sparks wobble across the bond, in the picture plane.
  const across = unit(-dy, dx, 0);
  const sparks: Spark[] = [];
  for (let index = 0; index < MOLECULE.sparks; index += 1) {
    const forward = index % 2 === 0;
    const travel = fract(time * (0.16 + 0.025 * index) + index * 0.41);
    const along = forward ? travel : 1 - travel;
    const wobble = 0.05 * Math.sin(TAU * (1.5 * travel + index * 0.37));
    sparks.push({
      position: {
        x: from.x + dx * along + across.x * wobble,
        y: from.y + dy * along + across.y * wobble,
        z: from.z + dz * along,
      },
      along,
      light: Math.sin(Math.PI * travel),
    });
  }
  return { atoms, bond: { from, to }, sparks };
}

/** The point of a ring at `angle` (radians, from `u` towards `v`). */
export function ringPoint(ring: RingPose, angle: number): Vec3 {
  const c = Math.cos(angle) * ring.radius;
  const s = Math.sin(angle) * ring.radius;
  return {
    x: ring.center.x + ring.u.x * c + ring.v.x * s,
    y: ring.center.y + ring.u.y * c + ring.v.y * s,
    z: ring.center.z + ring.u.z * c + ring.v.z * s,
  };
}

export interface Projected {
  /** Normalised device coordinates in [-1, 1], y up. */
  readonly x: number;
  readonly y: number;
  /** Size on screen of one molecule unit at that depth, in the same coordinates. */
  readonly scale: number;
  /** Depth towards the viewer (the point's z). */
  readonly depth: number;
}

/** Perspective projection by `MOLECULE_CAMERA`. */
export function project(point: Vec3): Projected {
  const scale = FOCAL / (MOLECULE_CAMERA.distance - point.z);
  return { x: point.x * scale, y: point.y * scale, scale, depth: point.z };
}

/**
 * Vertical field of view (degrees) that keeps the projected square [-1, 1]²
 * in view whatever the aspect ratio: wider than the camera's on portrait
 * stages, where the width is the limit. The same fit as an SVG's
 * `preserveAspectRatio="xMidYMid meet"`.
 */
export function fieldOfViewFor(aspect: number): number {
  const half = Math.tan((MOLECULE_CAMERA.fov * Math.PI) / 360) / Math.min(1, aspect);
  return (Math.atan(half) * 360) / Math.PI;
}
