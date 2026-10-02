import { calendarDateIn, type IsoDate, LYON_CAMPUS } from "@epilove/core";

/** Today's date on the campus (Europe/Paris), for age and calendar rules. */
export function campusToday(now: Date): IsoDate {
  return calendarDateIn(LYON_CAMPUS.timeZone, now);
}
