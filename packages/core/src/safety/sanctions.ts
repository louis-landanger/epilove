import type { AccountStatus } from "../policies/types";

/** Charter rules a decision can cite (docs/07, section A7, and the terms of use). */
export const CHARTER_RULES = [
  "respect",
  "consent",
  "authenticity",
  "discretion",
  "commerce",
  "eligibility",
  "minimum_age",
] as const;
export type CharterRule = (typeof CHARTER_RULES)[number];

/** Graduated actions (docs/07, section A4). Mirrors `MODERATION_ACTIONS` in the database. */
export const SANCTIONS = [
  "no_action",
  "warning",
  "content_removal",
  "restriction",
  "suspension",
  "ban",
] as const;
export type Sanction = (typeof SANCTIONS)[number];

/** Durations offered for time-bound sanctions, in days. */
export const SANCTION_DURATIONS: Readonly<Record<"restriction" | "suspension", readonly number[]>> = {
  restriction: [7, 30],
  suspension: [7, 30],
};

export interface SanctionEffect {
  /**
   * New account status, when the sanction changes it. Sign-in is never
   * blocked: a sanctioned member must still reach the statement of reasons
   * and the appeal form (DSA art. 17 and 20); the status keeps them out of
   * the app.
   */
  readonly status: AccountStatus | null;
  /** Sessions ended at once. */
  readonly revokeSessions: boolean;
  /** When the sanction lapses, `null` when it does not (warning, ban) or has no duration. */
  readonly expiresAt: Date | null;
  /** The precautionary hold on the profile is lifted (the decision replaces it). */
  readonly releaseHold: boolean;
}

export type SanctionInput =
  | { readonly action: "no_action" | "warning" | "content_removal" | "ban" }
  | { readonly action: "restriction" | "suspension"; readonly durationDays: number };

/** What a decision does to the account. Pure: applied by the API in one transaction. */
export function sanctionEffect(input: SanctionInput, now: Date): SanctionEffect {
  const expires = (days: number) => new Date(now.getTime() + days * 86_400_000);
  switch (input.action) {
    case "no_action":
    case "warning":
    case "content_removal":
      return {
        status: null,
        revokeSessions: false,
        expiresAt: null,
        releaseHold: true,
      };
    case "restriction":
      return {
        status: "restricted",
        revokeSessions: false,
        expiresAt: expires(input.durationDays),
        releaseHold: true,
      };
    case "suspension":
      return {
        status: "suspended",
        revokeSessions: false,
        expiresAt: expires(input.durationDays),
        releaseHold: true,
      };
    case "ban":
      return {
        status: "banned",
        revokeSessions: true,
        expiresAt: null,
        releaseHold: false,
      };
  }
}

/** A written statement of reasons is mandatory for every sanction (DSA art. 17): at least a real sentence. */
export const MIN_STATEMENT_LENGTH = 40;

export function isValidStatement(statement: string): boolean {
  return statement.trim().length >= MIN_STATEMENT_LENGTH;
}

/** Decisions can be contested for six months (DSA art. 20). */
export const APPEAL_WINDOW_DAYS = 183;

export function canAppeal(
  action: { readonly action: Sanction; readonly createdAt: Date },
  hasAppeal: boolean,
  now: Date,
): boolean {
  if (action.action === "no_action" || hasAppeal) {
    return false;
  }
  return now.getTime() - action.createdAt.getTime() <= APPEAL_WINDOW_DAYS * 86_400_000;
}

/** An appeal is always reviewed by someone else than the author of the decision (docs/07, A4). */
export function canReviewAppeal(reviewerId: string, decidedBy: string | null): boolean {
  return decidedBy === null || reviewerId !== decidedBy;
}
