/**
 * The two drops of glass of the hero under study `/apercu/verre`: two atoms
 * in front of the title that drift apart, snap together into one drop, then
 * slowly pull apart again, like liquid. Pure, so the motion can be tested.
 */

export interface Drop {
  /** Centre, in CSS pixels from the top left of the hero. */
  readonly x: number;
  readonly y: number;
  readonly radius: number;
}

export interface Box {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface Pair {
  readonly drops: readonly [Drop, Drop];
  /** Width of the liquid neck that joins the drops when they are close, in CSS pixels. */
  readonly bridge: number;
}

/** One sway of the pair's axis, in seconds. */
export const SWAY_PERIOD = 26;
/** From apart to one drop and apart again, in seconds. */
export const BOND_PERIOD = 11;
/** The slow drift of the pair across the title, in seconds (horizontal, vertical). */
const DRIFT_PERIODS = [31, 23] as const;
/** How far the pair drifts from the title's centre, as a share of its size. */
const DRIFT = { x: 0.1, y: 0.06 } as const;
/** When each drop condenses onto the title after the start, in seconds. */
const ENTRANCES = [0.1, 0.5] as const;
/** How far a drop may spill over the title's top and bottom edges, as a share of its height. */
export const SPILL = 0.03;

/** The drops' sizes: large in front of the title, never wider than two fifths of it, never tiny. */
export function dropRadii(title: Box): readonly [number, number] {
  const base = Math.max(Math.min(0.38 * title.height, 0.2 * title.width), 34);
  return [base, 0.8 * base];
}

/** A drop condensing, `time` seconds after it starts: from nothing to its size, overshooting a little. */
export function condensed(time: number): number {
  return time <= 0 ? 0 : 1 - Math.exp(-4.2 * time) * Math.cos(6.5 * time);
}

const smooth = (x: number) => x * x * (3 - 2 * x);

/**
 * How far apart the drops are over one bond (`phase` in [0, 1)), from 1 (as
 * far as they go) to 0 (one drop): they drift a little closer, snap
 * together, stay as one drop, then slowly pull apart.
 */
export function bondAt(phase: number): number {
  if (phase < 0.4) {
    return 1 - 0.2 * smooth(phase / 0.4);
  }
  if (phase < 0.5) {
    return 0.8 * (1 - ((phase - 0.4) / 0.1) ** 2.4);
  }
  if (phase < 0.64) {
    return 0;
  }
  return smooth((phase - 0.64) / 0.36);
}

/**
 * Where the drops are at `time` (seconds) in front of the title. The pair's
 * axis follows the title's diagonal (the first drop on the first line, the
 * second on the last) and sways; the bigger drop moves less, like the heavier
 * of two atoms; once merged, the drop quivers, and while they pull apart, the
 * neck between them stretches before it snaps.
 */
export function pairAt(time: number, title: Box): Pair {
  const [firstSize, secondSize] = dropRadii(title);
  const phase = (((time / BOND_PERIOD) % 1) + 1) % 1;
  const apart = bondAt(phase);
  const sinceMerged = (phase - 0.5) * BOND_PERIOD;
  const quiver = sinceMerged > 0 ? 0.05 * Math.exp(-5 * sinceMerged) * Math.sin(16 * sinceMerged) : 0;
  const first = firstSize * condensed(time - ENTRANCES[0]) * (1 + quiver);
  const second = secondSize * condensed(time - ENTRANCES[1]) * (1 - quiver);

  const centre = {
    x: title.x + title.width * (0.5 + DRIFT.x * Math.sin((2 * Math.PI * time) / DRIFT_PERIODS[0])),
    y: title.y + title.height * (0.5 + DRIFT.y * Math.sin((2 * Math.PI * time) / DRIFT_PERIODS[1] + 1.3)),
  };
  const angle =
    Math.atan2(1.6 * title.height, title.width) + 0.2 * Math.sin((2 * Math.PI * time) / SWAY_PERIOD);
  const axis = { x: Math.cos(angle), y: Math.sin(angle) };
  // As far apart as the title allows: both centres in front of it, and the drops within its width.
  const share = firstSize / (firstSize + secondSize);
  const reach = Math.max(share, 1 - share);
  const room = {
    x: Math.max((0.5 - DRIFT.x) * title.width - firstSize, 0),
    y: (0.42 - DRIFT.y) * title.height,
  };
  const merged = 0.45 * (firstSize + secondSize);
  const far = Math.max(
    merged,
    Math.min(
      2.6 * (firstSize + secondSize),
      room.x / (reach * Math.abs(axis.x)),
      room.y / (reach * Math.abs(axis.y)),
    ),
  );
  const distance = merged + (far - merged) * apart;
  const bob = 0.04 * title.height;
  const pulling = phase > 0.64 ? Math.sin((Math.PI * (phase - 0.64)) / 0.36) : 0;
  // Within the title's height, give or take a little: never over the copy above or below
  // it (the glass shows the title only). Eased, so the drops slow down near the edges.
  const middle = title.y + title.height / 2;
  const within = (y: number, size: number) => {
    const half = Math.max(title.height / 2 - 1.05 * size + SPILL * title.height, 1);
    return middle + half * Math.tanh((y - middle) / half);
  };

  return {
    drops: [
      {
        x: centre.x - axis.x * distance * (1 - share),
        y: within(centre.y - axis.y * distance * (1 - share) + bob * Math.sin(time * 0.9), firstSize),
        radius: first,
      },
      {
        x: centre.x + axis.x * distance * share,
        y: within(centre.y + axis.y * distance * share + bob * Math.sin(time * 0.9 + 2.1), secondSize),
        radius: second,
      },
    ],
    bridge: 0.5 * secondSize * (1 + 0.9 * pulling),
  };
}

/** How far two drops are from touching: below 0 they overlap and have merged. */
export function gapBetween([first, second]: readonly [Drop, Drop]): number {
  return Math.hypot(second.x - first.x, second.y - first.y) - first.radius - second.radius;
}
