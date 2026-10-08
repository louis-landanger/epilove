/**
 * The photographs of the hero under study `/apercu/gens` (docs/02-design.md,
 * section 5): people of the campus's age, never an identifiable face (backs,
 * silhouettes, hands), until the campus shoot with consenting students.
 * Photographs from Unsplash, under the Unsplash licence (free use, including
 * commercial, no attribution required), downloaded from images.unsplash.com
 * and recompressed: `crochus` photo-1470229722913-7c0e2dbbafd3, `amour`
 * photo-1474552226712-ac0f0961a954, `potes` photo-1529156069898-49953e39b3ac,
 * `binome` photo-1516321318423-f06f85e504b3.
 */

/** A point of a photograph, in fractions of its width and height. */
export type Point = readonly [number, number];

export interface Scene {
  /** Its line of the title, in the messages (`home.gens.lines.<key>`). */
  readonly key: "crochus" | "amour" | "potes" | "binome";
  readonly src: string;
  readonly width: number;
  readonly height: number;
  /**
   * Where the photograph stays when it is cropped (`object-position`, in
   * fractions): on portrait screens only a narrow band shows, and the two
   * people of the bond must be in it.
   */
  readonly focus: Point;
  /** The two people the bond links. */
  readonly bond: readonly [Point, Point];
  /** On portrait screens, where less of the photograph shows: two points closer together. */
  readonly narrowBond?: readonly [Point, Point];
}

export const SCENES: readonly [Scene, ...Scene[]] = [
  // A festival crowd: two people with their arms up, across the crowd.
  {
    key: "crochus",
    src: "/apercu/gens/crochus.jpg",
    width: 2400,
    height: 1600,
    focus: [0.42, 0.5],
    bond: [
      [0.31, 0.53],
      [0.565, 0.565],
    ],
    narrowBond: [
      [0.335, 0.515],
      [0.53, 0.6],
    ],
  },
  // Two cyclists at sunset, holding hands: the bond from heart to heart.
  {
    key: "amour",
    src: "/apercu/gens/amour.jpg",
    width: 2400,
    height: 1600,
    focus: [0.49, 0.5],
    bond: [
      [0.335, 0.675],
      [0.6, 0.67],
    ],
    narrowBond: [
      [0.38, 0.675],
      [0.585, 0.67],
    ],
  },
  // Friends seen from behind, arm in arm, facing the sea: the bond between two of them.
  {
    key: "potes",
    src: "/apercu/gens/potes.jpg",
    width: 2400,
    height: 1350,
    focus: [0.54, 0.5],
    bond: [
      [0.49, 0.64],
      [0.6, 0.65],
    ],
  },
  // Two people's hands on one laptop.
  {
    key: "binome",
    src: "/apercu/gens/binome.jpg",
    width: 2400,
    height: 1600,
    focus: [0.6, 0.5],
    bond: [
      [0.46, 0.58],
      [0.7, 0.66],
    ],
    narrowBond: [
      [0.47, 0.58],
      [0.67, 0.7],
    ],
  },
];

/** The two people a scene's bond links in a box: closer together on portrait screens. */
export function bondOf(scene: Scene, box: { readonly width: number; readonly height: number }) {
  return box.height > box.width && scene.narrowBond ? scene.narrowBond : scene.bond;
}

/**
 * Where a point of a photograph lands in a box the photograph covers
 * (`object-fit: cover`, `object-position` at `focus`), in the box's pixels.
 */
export function coverPoint(
  point: Point,
  photo: { readonly width: number; readonly height: number; readonly focus: Point },
  box: { readonly width: number; readonly height: number },
): { x: number; y: number } {
  const scale = Math.max(box.width / photo.width, box.height / photo.height);
  const width = photo.width * scale;
  const height = photo.height * scale;
  return {
    x: (box.width - width) * photo.focus[0] + point[0] * width,
    y: (box.height - height) * photo.focus[1] + point[1] * height,
  };
}

/**
 * The bond between two points: an arc that rises above them, by a fifth of
 * their distance (at least 24 pixels), as an SVG path.
 */
export function bondPath(from: { x: number; y: number }, to: { x: number; y: number }): string {
  const lift = Math.max(24, Math.hypot(to.x - from.x, to.y - from.y) / 5);
  const control = { x: (from.x + to.x) / 2, y: Math.min(from.y, to.y) - lift };
  const round = (value: number) => Math.round(value * 10) / 10;
  return `M${round(from.x)} ${round(from.y)} Q${round(control.x)} ${round(control.y)} ${round(to.x)} ${round(to.y)}`;
}
