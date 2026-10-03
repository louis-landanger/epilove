import { addDays, campusInstant } from "../discovery/drop";
import { calendarDateIn } from "../time/calendar";

/**
 * Campus community (COM-01 question of the week, COM-02 cross-school index,
 * PAC-04 Pact statistics). Every figure shown is an aggregate of at least
 * `ANONYMITY_THRESHOLD` people, and no total is shown that would let someone
 * work out a hidden group by subtraction.
 */
export const ANONYMITY_THRESHOLD = 10;

/** Weekly questions only count towards compatibility over the last weeks. */
export const WEEKLY_RULES = {
  agreementWeeks: 8,
  /** Fewer common answers than this tells nothing. */
  minCommonAnswers: 2,
} as const;

const MS_PER_DAY = 86_400_000;

/** Wall-clock date (Y, M, D) of an instant in a time zone. */
function localDate(instant: Date, timeZone: string): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(instant);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return { year: get("year"), month: get("month"), day: get("day") };
}

/**
 * ISO 8601 week of an instant, in the campus time zone: "2026-W40". Weeks
 * start on Monday at midnight, campus time.
 */
export function isoWeek(instant: Date, timeZone: string): string {
  const { year, month, day } = localDate(instant, timeZone);
  const date = new Date(Date.UTC(year, month - 1, day));
  const weekday = date.getUTCDay() || 7;
  // The Thursday of the same week decides the ISO year.
  date.setUTCDate(date.getUTCDate() + 4 - weekday);
  const isoYear = date.getUTCFullYear();
  const firstDay = Date.UTC(isoYear, 0, 1);
  const week = Math.ceil(((date.getTime() - firstDay) / MS_PER_DAY + 1) / 7);
  return `${isoYear}-W${String(week).padStart(2, "0")}`;
}

/** When the current week ends: next Monday at midnight, campus time. */
export function weekEndsAt(now: Date, timeZone: string): Date {
  const today = calendarDateIn(timeZone, now);
  const weekday = new Date(`${today}T12:00:00Z`).getUTCDay() || 7;
  return campusInstant(addDays(today, 8 - weekday), 0, 0, timeZone);
}

/** Number of weeks since 1970-W01: rotates the bank of questions. */
export function weekNumber(week: string): number {
  const match = /^(\d{4})-W(\d{2})$/.exec(week);
  if (!match) {
    throw new Error(`Invalid ISO week: ${week}`);
  }
  const year = Number(match[1]);
  const index = Number(match[2]);
  // Monday of ISO week 1 of `year`: the week holding January 4th.
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const monday = jan4.getTime() - ((jan4.getUTCDay() || 7) - 1) * MS_PER_DAY;
  const epochMonday = Date.UTC(1969, 11, 29);
  return Math.round((monday - epochMonday) / (7 * MS_PER_DAY)) + index - 1;
}

/** The question of the week, rotating through the active bank in order. */
export function questionForWeek<T>(bank: readonly T[], week: string): T | null {
  if (bank.length === 0) {
    return null;
  }
  return bank[weekNumber(week) % bank.length] ?? null;
}

/** The weeks whose answers count towards compatibility, newest first. */
export function recentWeeks(
  now: Date,
  timeZone: string,
  count: number = WEEKLY_RULES.agreementWeeks,
): string[] {
  return Array.from({ length: count }, (_, i) =>
    isoWeek(new Date(now.getTime() - i * 7 * MS_PER_DAY), timeZone),
  );
}

/**
 * Share of identical answers between two members over the weeks both
 * answered, in [0, 1]; null when they share too few answers.
 */
export function weeklyAgreement(
  a: ReadonlyMap<string, string> | undefined,
  b: ReadonlyMap<string, string> | undefined,
): number | null {
  if (!a || !b) {
    return null;
  }
  let common = 0;
  let same = 0;
  for (const [week, answer] of a) {
    const other = b.get(week);
    if (other !== undefined) {
      common++;
      if (other === answer) {
        same++;
      }
    }
  }
  return common < WEEKLY_RULES.minCommonAnswers ? null : same / common;
}

export interface GroupCount {
  readonly group: string;
  readonly option: string;
  readonly count: number;
}

export interface Distribution {
  readonly total: number;
  /** Whole percentages per option, in the given option order. */
  readonly shares: readonly { readonly option: string; readonly percent: number }[];
}

function distribution(counts: ReadonlyMap<string, number>, options: readonly string[]): Distribution {
  const total = [...counts.values()].reduce((sum, n) => sum + n, 0);
  return {
    total,
    shares: options.map((option) => ({
      option,
      percent: total === 0 ? 0 : Math.round(((counts.get(option) ?? 0) / total) * 100),
    })),
  };
}

/**
 * Results of a poll by group (school): groups below the threshold are left
 * out, and the overall figure is shown only if what is left out is either
 * nothing or itself above the threshold (no inference by subtraction).
 */
export function anonymousResults(
  counts: readonly GroupCount[],
  options: readonly string[],
  threshold: number = ANONYMITY_THRESHOLD,
): {
  readonly overall: Distribution | null;
  readonly groups: readonly ({ readonly group: string } & Distribution)[];
} {
  const byGroup = new Map<string, Map<string, number>>();
  const overall = new Map<string, number>();
  for (const { group, option, count } of counts) {
    const map = byGroup.get(group) ?? new Map<string, number>();
    map.set(option, (map.get(option) ?? 0) + count);
    byGroup.set(group, map);
    overall.set(option, (overall.get(option) ?? 0) + count);
  }
  const groups = [...byGroup.entries()]
    .map(([group, map]) => ({ group, ...distribution(map, options) }))
    .filter((g) => g.total >= threshold)
    .sort((a, b) => a.group.localeCompare(b.group));
  const all = distribution(overall, options);
  const hidden = all.total - groups.reduce((sum, g) => sum + g.total, 0);
  const showOverall = all.total >= threshold && (hidden === 0 || hidden >= threshold);
  return { overall: showOverall ? all : null, groups };
}

/** Pairs of different schools with at least `threshold` new matches (COM-02); same-school pairs are not part of it. */
export function crossSchoolIndex(
  pairs: readonly { readonly a: string; readonly b: string; readonly count: number }[],
  threshold: number = ANONYMITY_THRESHOLD,
): { readonly a: string; readonly b: string; readonly count: number }[] {
  const merged = new Map<string, { a: string; b: string; count: number }>();
  for (const pair of pairs) {
    if (pair.a === pair.b) {
      continue;
    }
    const [a, b] = pair.a < pair.b ? [pair.a, pair.b] : [pair.b, pair.a];
    const key = `${a}|${b}`;
    const current = merged.get(key) ?? { a, b, count: 0 };
    current.count += pair.count;
    merged.set(key, current);
  }
  return [...merged.values()]
    .filter((p) => p.count >= threshold)
    .sort((x, y) => y.count - x.count || x.a.localeCompare(y.a) || x.b.localeCompare(y.b));
}
