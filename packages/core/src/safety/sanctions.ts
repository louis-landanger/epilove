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
  /** New account status, when the sanction changes it. */
  readonly status: AccountStatus | null;
  /** Sign-in blocked (ban). */
  readonly signInBlocked: boolean;
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
        signInBlocked: false,
        revokeSessions: false,
        expiresAt: null,
        releaseHold: true,
      };
    case "restriction":
      return {
        status: "restricted",
        signInBlocked: false,
        revokeSessions: false,
        expiresAt: expires(input.durationDays),
        releaseHold: true,
      };
    case "suspension":
      return {
        status: "suspended",
        signInBlocked: false,
        revokeSessions: false,
        expiresAt: expires(input.durationDays),
        releaseHold: true,
      };
    case "ban":
      return {
        status: "banned",
        signInBlocked: true,
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
