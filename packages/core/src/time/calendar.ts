/**
 * Calendar dates as `YYYY-MM-DD` strings. Domain rules (age, activity) work on
 * calendar days in the campus time zone, never on raw timestamps, so that a
 * birthday or a "21 days" window does not shift with the server's time zone.
 */
export type IsoDate = string;

export interface CalendarDate {
  readonly year: number;
  readonly month: number;
  readonly day: number;
}

const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const MS_PER_DAY = 86_400_000;

/** Parses a `YYYY-MM-DD` string and rejects impossible dates such as 2027-02-30. */
export function parseIsoDate(value: IsoDate): CalendarDate {
  const match = ISO_DATE_PATTERN.exec(value);
  if (!match) {
    throw new RangeError(`Invalid ISO date: ${value}`);
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const utc = new Date(Date.UTC(year, month - 1, day));
  if (utc.getUTCFullYear() !== year || utc.getUTCMonth() !== month - 1 || utc.getUTCDate() !== day) {
    throw new RangeError(`Invalid ISO date: ${value}`);
  }
  return { year, month, day };
}

function toUtcMidnight(value: IsoDate): number {
  const { year, month, day } = parseIsoDate(value);
  return Date.UTC(year, month - 1, day);
}

/** Number of calendar days from `from` to `to` (negative when `to` is earlier). */
export function daysBetween(from: IsoDate, to: IsoDate): number {
  return Math.round((toUtcMidnight(to) - toUtcMidnight(from)) / MS_PER_DAY);
}

/** The calendar date of `instant` in `timeZone` (for example `Europe/Paris`). */
export function calendarDateIn(timeZone: string, instant: Date): IsoDate {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instant);
}
