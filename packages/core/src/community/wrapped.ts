import { campusInstant } from "../discovery/drop";
import { calendarDateIn } from "../time/calendar";

/**
 * Wrapped (COM-03): the member's own year on the app, as a story. Only their
 * own figures (never anyone else's name or photo), shown to them alone and
 * exported only if they want.
 */
export function academicYear(now: Date, timeZone: string): { label: string; since: Date } {
  const today = calendarDateIn(timeZone, now);
  const year = Number(today.slice(0, 4));
  const month = Number(today.slice(5, 7));
  const start = month >= 9 ? year : year - 1;
  return { label: `${start}–${start + 1}`, since: campusInstant(`${start}-09-01`, 0, 0, timeZone) };
}

/** Reactions as words, for the exported image (no emoji font fetched from a third party). */
export const REACTION_WORDS: Readonly<Record<string, string>> = {
  "❤️": "le cœur",
  "😂": "le fou rire",
  "😮": "la surprise",
  "😢": "la larme",
  "👍": "le pouce",
  "🔥": "la flamme",
};
