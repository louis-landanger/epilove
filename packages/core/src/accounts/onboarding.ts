import { isAdult, MINIMUM_AGE } from "../people/age";
import type { Gender, Mode } from "../policies/types";
import { MAX_INTERESTS, MIN_INTERESTS, MIN_PHOTOS, PROMPT_ANSWER_COUNT } from "../profiles/rules";
import { type IsoDate, parseIsoDate } from "../time/calendar";

/**
 * Onboarding (ONB-04 to ONB-06, ONB-12): the order of the steps and the
 * rules deciding whether an account can become active.
 */
export const ONBOARDING_STEPS = [
  "charter",
  "name",
  "birth",
  "gender",
  "seeking",
  "audience",
  "photos",
  "prompts",
  "interests",
  "campus",
] as const;
export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];

/**
 * Versions of the texts accepted during onboarding, stored with each consent
 * as proof (GDPR art. 7). Bump a version when its text changes materially.
 */
export const LEGAL_VERSIONS = {
  terms: "2026-10-draft",
  privacy: "2026-10-draft",
  sensitive_data: "2026-10-draft",
} as const;

export const MAX_AGE_PREFERENCE = 99;

/** Everything the completion check needs, as loaded from the database. */
export interface OnboardingProgress {
  readonly charterAccepted: boolean;
  readonly firstName: string | null;
  readonly birthDate: IsoDate | null;
  readonly gender: Gender | null;
  readonly modes: readonly Mode[];
  /** Explicit, separate consent to the processing of sensitive data (ONB-05). */
  readonly sensitiveConsent: boolean;
  readonly interestedIn: readonly Gender[];
  readonly audienceSet: boolean;
  /** Uploaded photos that were not rejected by processing or moderation. */
  readonly photos: number;
  readonly promptAnswers: number;
  readonly interests: number;
  readonly graduationYear: number | null;
  readonly campusDeclared: boolean;
}

/** Steps still to do, in order. Empty when the account can be activated. */
export function missingSteps(progress: OnboardingProgress, today: IsoDate): OnboardingStep[] {
  const missing: OnboardingStep[] = [];
  if (!progress.charterAccepted) missing.push("charter");
  if (!progress.firstName) missing.push("name");
  if (!progress.birthDate || !isAdult(progress.birthDate, today)) missing.push("birth");
  if (!progress.gender) missing.push("gender");
  if (progress.modes.length === 0) missing.push("seeking");
  const needsInterestedIn =
    progress.modes.includes("love") && (!progress.sensitiveConsent || progress.interestedIn.length === 0);
  if (!progress.audienceSet || needsInterestedIn) missing.push("audience");
  if (progress.photos < MIN_PHOTOS) missing.push("photos");
  if (progress.promptAnswers < PROMPT_ANSWER_COUNT) missing.push("prompts");
  if (progress.interests < MIN_INTERESTS || progress.interests > MAX_INTERESTS) missing.push("interests");
  if (progress.graduationYear === null || !progress.campusDeclared) missing.push("campus");
  return missing;
}

/** The step to show when the member comes back, or `null` when everything is done. */
export function nextStep(progress: OnboardingProgress, today: IsoDate): OnboardingStep | null {
  return missingSteps(progress, today)[0] ?? null;
}

/**
 * Love mode needs the sensitive-data consent: without it, the member only
 * gets Friends mode (docs/08-juridique-rgpd.md, section 3.1).
 */
export function effectiveModes(modes: readonly Mode[], sensitiveConsent: boolean): Mode[] {
  const allowed = modes.filter((mode) => mode !== "love" || sensitiveConsent);
  return allowed.length > 0 ? [...new Set(allowed)] : ["friends"];
}

export type BirthDateCheck =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: "invalid" | "future" | "underage" | "implausible" };

/** Blocking 18+ check (ONB-04). Dates more than 100 years back are typos, not centenarians. */
export function checkBirthDate(birthDate: IsoDate, today: IsoDate): BirthDateCheck {
  try {
    parseIsoDate(birthDate);
  } catch {
    return { ok: false, reason: "invalid" };
  }
  if (birthDate > today) {
    return { ok: false, reason: "future" };
  }
  const { year } = parseIsoDate(today);
  if (birthDate < `${year - 100}-01-01`) {
    return { ok: false, reason: "implausible" };
  }
  if (!isAdult(birthDate, today)) {
    return { ok: false, reason: "underage" };
  }
  return { ok: true };
}

/** The day a person born on `birthDate` turns 18 (29 February counts as 1 March). */
export function adulthoodDate(birthDate: IsoDate): IsoDate {
  const { year, month, day } = parseIsoDate(birthDate);
  const target = year + MINIMUM_AGE;
  const leap = (target % 4 === 0 && target % 100 !== 0) || target % 400 === 0;
  if (month === 2 && day === 29 && !leap) {
    return `${target}-03-01`;
  }
  return `${target}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Age range suggested from the member's own age: a starting point, always editable. */
export function defaultAgeRange(age: number): { min: number; max: number } {
  const min = Math.max(MINIMUM_AGE, age - 3);
  const max = Math.min(MAX_AGE_PREFERENCE, Math.max(min, age + 4));
  return { min, max };
}

export function isValidAgeRange(min: number, max: number): boolean {
  return (
    Number.isInteger(min) &&
    Number.isInteger(max) &&
    min >= MINIMUM_AGE &&
    max <= MAX_AGE_PREFERENCE &&
    min <= max
  );
}

/**
 * Academic year of a date, named after its first calendar year. Summer
 * (July and August) already belongs to the next academic year.
 */
export function academicYearOf(today: IsoDate): number {
  const { year, month } = parseIsoDate(today);
  return month >= 7 ? year : year - 1;
}

/** Graduation years a current student can declare (ONB-12): this academic year to six years ahead. */
export function graduationYearRange(today: IsoDate): { min: number; max: number } {
  const start = academicYearOf(today);
  return { min: start + 1, max: start + 6 };
}

/**
 * Deadline of the next annual re-verification (ONB-09): every September a new
 * code is sent to the school address, to be confirmed within 30 days.
 */
export function nextReverificationDue(today: IsoDate): IsoDate {
  // 1 September + 30 days.
  return `${academicYearOf(today) + 1}-10-01`;
}

/** The re-verification window opens 30 days before the deadline (1 September). */
export const REVERIFICATION_WINDOW_DAYS = 30;

/** First day a fresh proof of the school address counts for the deadline `due`. */
export function reverificationOpensOn(due: IsoDate): IsoDate {
  const { year } = parseIsoDate(due);
  return `${year}-09-01`;
}

export type ReverificationState = "ok" | "due" | "overdue";

/**
 * ONB-09: from 1 September the member must sign in once with a code sent to
 * the school address; after the deadline the account is paused until they do.
 */
export function reverificationState(today: IsoDate, due: IsoDate | null): ReverificationState {
  if (!due || today < reverificationOpensOn(due)) {
    return "ok";
  }
  return today >= due ? "overdue" : "due";
}
