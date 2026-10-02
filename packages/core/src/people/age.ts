import { type IsoDate, parseIsoDate } from "../time/calendar";

/** Legal and non-negotiable (docs/08-juridique-rgpd.md). */
export const MINIMUM_AGE = 18;

/**
 * Age in whole years on `onDate`. A person born on 29 February gets one year
 * older on 1 March in non-leap years: the conservative choice for an 18+ check.
 */
export function ageOn(birthDate: IsoDate, onDate: IsoDate): number {
  const birth = parseIsoDate(birthDate);
  const on = parseIsoDate(onDate);
  const birthdayPassed = on.month > birth.month || (on.month === birth.month && on.day >= birth.day);
  return on.year - birth.year - (birthdayPassed ? 0 : 1);
}

export function isAdult(birthDate: IsoDate, onDate: IsoDate): boolean {
  return ageOn(birthDate, onDate) >= MINIMUM_AGE;
}
