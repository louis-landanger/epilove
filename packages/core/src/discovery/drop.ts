import { calendarDateIn, type IsoDate, parseIsoDate } from "../time/calendar";

/**
 * The evening Drop (DEC-07, docs/06-matching.md, section 8): every evening at
 * 21:00, five high-compatibility profiles, available for 24 hours. Computed
 * at 20:30. A profile appears in at most `maxAppearances` Drops per day, so
 * that popular profiles are not in everyone's Drop.
 */
export const DROP_RULES = {
  size: 5,
  maxAppearances: 10,
  computeAt: { hour: 20, minute: 30 },
  publishAt: { hour: 21, minute: 0 },
  /** Best candidates kept per member before the assignment (bounds memory, not quality). */
  candidatesPerMember: 40,
} as const;

function zoneOffsetMs(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  const wall = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return wall - Math.floor(instant.getTime() / 1000) * 1000;
}

/** The instant of a wall-clock time on a campus date (daylight saving time included). */
export function campusInstant(date: IsoDate, hour: number, minute: number, timeZone: string): Date {
  const { year, month, day } = parseIsoDate(date);
  const wall = Date.UTC(year, month - 1, day, hour, minute);
  const first = wall - zoneOffsetMs(new Date(wall), timeZone);
  return new Date(wall - zoneOffsetMs(new Date(first), timeZone));
}

export function addDays(date: IsoDate, days: number): IsoDate {
  const { year, month, day } = parseIsoDate(date);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

const publishOn = (date: IsoDate, timeZone: string) =>
  campusInstant(date, DROP_RULES.publishAt.hour, DROP_RULES.publishAt.minute, timeZone);

/** The Drop available at `now`: today's after 21:00, yesterday's before. */
export function dropDayAt(now: Date, timeZone: string): IsoDate {
  const today = calendarDateIn(timeZone, now);
  return now >= publishOn(today, timeZone) ? today : addDays(today, -1);
}

/** When the Drop of `day` is published, and when it expires (the next one replaces it). */
export function dropWindow(day: IsoDate, timeZone: string) {
  return { publishedAt: publishOn(day, timeZone), expiresAt: publishOn(addDays(day, 1), timeZone) };
}

/** The next publication strictly after `now`. */
export function nextDropAt(now: Date, timeZone: string): Date {
  return dropWindow(dropDayAt(now, timeZone), timeZone).expiresAt;
}

/** What the scheduler should do for today's Drop at `now`. */
export function dropSchedule(now: Date, timeZone: string) {
  const day = calendarDateIn(timeZone, now);
  const computeAt = campusInstant(day, DROP_RULES.computeAt.hour, DROP_RULES.computeAt.minute, timeZone);
  return { day, computeDue: now >= computeAt, publishDue: now >= publishOn(day, timeZone) };
}

export interface DropCandidate {
  /** The member who receives the Drop. */
  readonly viewer: string;
  /** The profile proposed to them. */
  readonly candidate: string;
  readonly score: number;
}

/**
 * Greedy capacity-constrained assignment (docs/06, section 8, version 1): all
 * candidate pairs by decreasing score; a pair is kept while the viewer has
 * fewer than `size` profiles and the candidate fewer than `maxAppearances`.
 * Deterministic (ties broken by ids).
 */
export function assignDrops(
  pairs: readonly DropCandidate[],
  options: { size?: number; maxAppearances?: number } = {},
): Map<string, string[]> {
  const size = options.size ?? DROP_RULES.size;
  const maxAppearances = options.maxAppearances ?? DROP_RULES.maxAppearances;
  const sorted = [...pairs].sort(
    (x, y) =>
      y.score - x.score ||
      (x.viewer < y.viewer ? -1 : x.viewer > y.viewer ? 1 : x.candidate < y.candidate ? -1 : 1),
  );
  const drops = new Map<string, string[]>();
  const appearances = new Map<string, number>();
  for (const { viewer, candidate } of sorted) {
    if (viewer === candidate) {
      continue;
    }
    const drop = drops.get(viewer) ?? [];
    if (drop.length >= size || drop.includes(candidate)) {
      continue;
    }
    const count = appearances.get(candidate) ?? 0;
    if (count >= maxAppearances) {
      continue;
    }
    drop.push(candidate);
    drops.set(viewer, drop);
    appearances.set(candidate, count + 1);
  }
  return drops;
}
