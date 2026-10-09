import type { CityFlight } from "@atomes/three";

/**
 * Hands the plan of Lyon's dots from the plan's canvas (city-canvas.tsx),
 * once lit, to the ion field (ion-field-canvas.tsx), which flies them into
 * the logo mark as the page scrolls. Either may start first.
 */

let current: CityFlight | null = null;
const listeners = new Set<(flight: CityFlight | null) => void>();

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
