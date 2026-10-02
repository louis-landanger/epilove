import type { AccountStatus } from "../policies/types";

/** Profile, photos and content are erased this long after a deletion request (SAF-14). */
export const ACCOUNT_PURGE_DELAY_DAYS = 30;

/** Declared identity kept after closure (docs/08, décret n° 2021-1362). */
export const IDENTITY_RETENTION_YEARS = 5;

/** Only an active member can pause; a restriction or sanction cannot be dodged by pausing. */
export function canPause(status: AccountStatus): boolean {
  return status === "active";
}

export function canResume(status: AccountStatus): boolean {
  return status === "paused";
}

/** A member can always delete their account, except while it is already being deleted. */
export function canRequestDeletion(status: AccountStatus): boolean {
  return status !== "deleting";
}

export function plusYears(date: Date, years: number): Date {
  const next = new Date(date);
  next.setUTCFullYear(next.getUTCFullYear() + years);
  return next;
}

export function plusDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86_400_000);
}
