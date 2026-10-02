/** The Pact reveal: Thursday 11 February 2027, 20:00 Europe/Paris (UTC+1 in winter), docs/10-lancement.md. */
export const PACT_REVEAL_AT = "2027-02-11T20:00:00+01:00";

export interface Remaining {
  readonly days: number;
  readonly hours: number;
  readonly minutes: number;
  readonly seconds: number;
}

/** Time left until `target` (epoch milliseconds), or null once it has passed. */
export function remainingUntil(target: number, now: number): Remaining | null {
  const diff = target - now;
  if (diff <= 0) {
    return null;
  }
  const seconds = Math.floor(diff / 1000);
  return {
    days: Math.floor(seconds / 86_400),
    hours: Math.floor((seconds % 86_400) / 3600),
    minutes: Math.floor((seconds % 3600) / 60),
    seconds: seconds % 60,
  };
}
