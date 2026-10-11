import type { CityFlight } from "@atomes/three";

/**
 * Hands the plan of Lyon's dots from the plan's canvas (city-canvas.tsx),
 * once lit, to the ion field (ion-field-canvas.tsx), which flies them into
 * the logo mark as the page scrolls, and tells the plan's canvas back when
 * the field draws them, for it to step aside. Either may start first.
 */

let current: CityFlight | null = null;
const listeners = new Set<(flight: CityFlight | null) => void>();
let flying = false;
const flyingListeners = new Set<(flying: boolean) => void>();

export function publishCityFlight(flight: CityFlight | null): void {
  current = flight;
  for (const listener of listeners) {
    listener(flight);
  }
}

/** Calls `listener` with the dots now if there are any, then whenever they change; returns the unsubscribe. */
export function onCityFlight(listener: (flight: CityFlight | null) => void): () => void {
  listeners.add(listener);
  if (current) {
    listener(current);
  }
  return () => {
    listeners.delete(listener);
  };
}

/** The ion field draws the plan's dots (true) or hands them back to the plan's canvas (false). */
export function setCityFlying(next: boolean): void {
  if (next === flying) {
    return;
  }
  flying = next;
  for (const listener of flyingListeners) {
    listener(next);
  }
}

/** Calls `listener` with whether the field draws the plan's dots, now and whenever it changes; returns the unsubscribe. */
export function onCityFlying(listener: (flying: boolean) => void): () => void {
  flyingListeners.add(listener);
  listener(flying);
  return () => {
    flyingListeners.delete(listener);
  };
}
