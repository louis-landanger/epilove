import type { PersonKey } from "../match/people";

/**
 * The hero's hand (docs/02-design.md, section 5): one fictional student per
 * school, fanned out from left to right.
 */
export const HAND: readonly PersonKey[] = ["hugo", "camille", "ines", "lea", "yanis"];

/** Where a released card goes. */
export type Outcome = "like" | "pass" | "back";

/** How far (CSS pixels) or how fast (pixels per millisecond) a card must go to leave the hand. */
export const THROW_DISTANCE = 110;
export const THROW_SPEED = 0.55;

/** A pointer position, in CSS pixels, and when it was read, in milliseconds. */
export interface Sample {
  readonly x: number;
  readonly y: number;
  readonly t: number;
}

/** The pointer's velocity over the last `window` milliseconds, in pixels per millisecond. */
export function velocityOf(samples: readonly Sample[], window = 100): { vx: number; vy: number } {
  const last = samples.at(-1);
  if (!last) {
    return { vx: 0, vy: 0 };
  }
  const first = samples.find((sample) => last.t - sample.t <= window) ?? last;
  const elapsed = last.t - first.t;
  if (elapsed <= 0) {
    return { vx: 0, vy: 0 };
  }
  return { vx: (last.x - first.x) / elapsed, vy: (last.y - first.y) / elapsed };
}

/**
 * Where a card goes once released, from how far it was dragged and how fast
 * it was moving: far or fast enough to the left, it is passed; to the right
 * or upwards (thrown at the title), liked; pulled down, or not far and fast
 * enough, it goes back into the hand. The direction is the throw's when the
 * card was thrown, the drag's otherwise.
 */
export function outcomeOf(drag: { dx: number; dy: number }, velocity: { vx: number; vy: number }): Outcome {
  const thrown = Math.hypot(velocity.vx, velocity.vy) >= THROW_SPEED;
  if (!thrown && Math.hypot(drag.dx, drag.dy) < THROW_DISTANCE) {
    return "back";
  }
  const [x, y] = thrown ? [velocity.vx, velocity.vy] : [drag.dx, drag.dy];
  if (y > 0 && y > Math.abs(x)) {
    return "back";
  }
  // Left of a 60° cone around straight up: passed.
  return x < 0 && Math.abs(x) > Math.abs(y) * Math.tan(Math.PI / 6) ? "pass" : "like";
}

/** The flight of a card leaving the hand: at least this fast, in pixels per millisecond. */
const FLIGHT_SPEED = 1.6;

/**
 * The velocity a card leaves with: the throw's, sped up to fly off the hero
 * briskly; a card liked with a click or a key flies to the upper right.
 */
export function flightOf(
  outcome: "like" | "pass",
  velocity: { vx: number; vy: number },
): { vx: number; vy: number } {
  const speed = Math.hypot(velocity.vx, velocity.vy);
  if (speed < THROW_SPEED) {
    const direction = outcome === "like" ? 1 : -1;
    return { vx: direction * FLIGHT_SPEED * 0.9, vy: -FLIGHT_SPEED * 0.45 };
  }
  const boost = Math.max(1, FLIGHT_SPEED / speed);
  return { vx: velocity.vx * boost, vy: velocity.vy * boost };
}

/** Chemistry with each student of the hand, in percent: always the same for the same person. */
export function chemistryWith(person: PersonKey): number {
  let hash = 0;
  for (const character of person) {
    hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  }
  return 84 + (hash % 13);
}
