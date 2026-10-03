import { calendarDateIn } from "../time/calendar";
import { addDays, campusInstant } from "./drop";

/**
 * Blind mode (DEC-10): one evening a week, a deck without photos (prompts and
 * answers only). A like given in that deck makes a blind match: each sees the
 * other's photos only once both have sent ten messages.
 */
export const BLIND_RULES = {
  /** Thursday (ISO weekday 4), from 19:00 to midnight, campus time. */
  weekday: 4,
  fromHour: 19,
  messagesToReveal: 10,
} as const;

function isoWeekday(date: string): number {
  return new Date(`${date}T12:00:00Z`).getUTCDay() || 7;
}

/** The current or next blind evening: when it starts and ends. */
export function blindEvening(now: Date, timeZone: string): { startsAt: Date; endsAt: Date; active: boolean } {
  const today = calendarDateIn(timeZone, now);
  const ahead = (BLIND_RULES.weekday - isoWeekday(today) + 7) % 7;
  let day = addDays(today, ahead);
  let startsAt = campusInstant(day, BLIND_RULES.fromHour, 0, timeZone);
  let endsAt = campusInstant(addDays(day, 1), 0, 0, timeZone);
  if (now.getTime() >= endsAt.getTime()) {
    day = addDays(day, 7);
    startsAt = campusInstant(day, BLIND_RULES.fromHour, 0, timeZone);
    endsAt = campusInstant(addDays(day, 1), 0, 0, timeZone);
  }
  return {
    startsAt,
    endsAt,
    active: now.getTime() >= startsAt.getTime() && now.getTime() < endsAt.getTime(),
  };
}

/** Photos of a blind match show once both members sent enough messages. */
export function blindRevealed(sent: { readonly mine: number; readonly theirs: number }): boolean {
  return sent.mine >= BLIND_RULES.messagesToReveal && sent.theirs >= BLIND_RULES.messagesToReveal;
}
