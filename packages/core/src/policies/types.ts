import type { IsoDate } from "../time/calendar";

export const MODES = ["love", "friends"] as const;
export type Mode = (typeof MODES)[number];

export const GENDERS = ["woman", "man", "nonbinary"] as const;
export type Gender = (typeof GENDERS)[number];

export const ACCOUNT_STATUSES = [
  "onboarding",
  "active",
  "paused",
  "restricted",
  "suspended",
  "banned",
  "deleting",
] as const;
export type AccountStatus = (typeof ACCOUNT_STATUSES)[number];

/** Everything the access policies need to know about one member. */
export interface Member {
  readonly id: string;
  readonly status: AccountStatus;
  /** Profile completed with at least one approved photo. */
  readonly profileComplete: boolean;
  readonly schoolSlug: string;
  readonly graduationYear: number;
  readonly birthDate: IsoDate;
  readonly gender: Gender;
  readonly modes: readonly Mode[];
  /** Genders sought in love mode. Sensitive data (GDPR art. 9). */
  readonly interestedIn: readonly Gender[];
  readonly ageRange: { readonly min: number; readonly max: number };
  readonly hideFromOwnSchool: boolean;
  readonly hideFromOwnYear: boolean;
  readonly incognito: boolean;
  /** HMAC of the canonical school email: never the address itself. */
  readonly emailHmac: string;
  /** HMACs of the addresses this member chose to hide from (SAF-04). */
  readonly hiddenEmailHmacs: ReadonlySet<string>;
  readonly lastActiveOn: IsoDate;
}

/** Relations between members, loaded by the caller (database, cache…). */
export interface Relations {
  hasBlocked(blockerId: string, blockedId: string): boolean;
  hasLiked(actorId: string, targetId: string): boolean;
}

export interface PolicyContext {
  /** Today's date in the campus time zone. */
  readonly today: IsoDate;
  readonly relations: Relations;
}

/**
 * Internal reason a profile is hidden. For logs, metrics and tests only:
 * it must never be shown to members (it could reveal a block or a hiding rule).
 */
export type HiddenReason =
  | "self"
  | "underage"
  | "viewer_not_eligible"
  | "target_unavailable"
  | "blocked"
  | "hidden_contact"
  | "hidden_school"
  | "hidden_year"
  | "incognito"
  | "inactive"
  | "age_preference"
  | "no_compatible_mode";

export type VisibilityDecision =
  | { readonly visible: true; readonly modes: readonly Mode[] }
  | { readonly visible: false; readonly reason: HiddenReason };
