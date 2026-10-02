import { ACCOUNT_STATUSES, type Gender } from "@epilove/core";
import { sql } from "drizzle-orm";
import { boolean, check, date, index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { school } from "./campus";
import { createdAt, id, oneOf, timestamps } from "./columns";

export const ROLES = ["user", "organizer", "moderator", "admin"] as const;
export type Role = (typeof ROLES)[number];

export const CONSENT_KINDS = ["terms", "privacy", "sensitive_data", "ai_features", "email_digest"] as const;
export type ConsentKind = (typeof CONSENT_KINDS)[number];

/**
 * A member. Column names are compatible with Better Auth's user model
 * (`name`, `emailVerified`, `image`) and its admin plugin (`role`, `banned`,
 * `banReason`, `banExpires`), so the auth library can map onto this table.
 */
export const appUser = pgTable(
  "app_user",
  {
    id: id(),
    schoolId: uuid()
      .notNull()
      .references(() => school.id, { onDelete: "restrict" }),
    /** Canonical school email (lowercase, without `+tag`), see `parseSchoolEmail`. */
    email: text().notNull().unique(),
    /** HMAC-SHA256 of the canonical email, used for hidden contacts and secret crushes. */
    emailHmac: text().notNull().unique(),
    emailVerified: boolean().notNull().default(false),
    /** Better Auth display name. Holds the first name once onboarding is done. */
    name: text().notNull().default(""),
    image: text(),
    role: text({ enum: ROLES }).notNull().default("user"),
    banned: boolean().notNull().default(false),
    banReason: text(),
    banExpires: timestamp({ withTimezone: true }),
    status: text({ enum: ACCOUNT_STATUSES }).notNull().default("onboarding"),
    verifiedAt: timestamp({ withTimezone: true }),
    reverifyDueAt: timestamp({ withTimezone: true }),
    lastActiveAt: timestamp({ withTimezone: true }),
    /** Scheduled pause (SAF-08, "mode partiels"): the account comes back by itself after this date. */
    pausedUntil: timestamp({ withTimezone: true }),
    /** Self-service deletion (SAF-14): content is purged 30 days later. */
    deletionRequestedAt: timestamp({ withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    check("app_user_role_check", oneOf(t.role, ROLES)),
    check("app_user_status_check", oneOf(t.status, ACCOUNT_STATUSES)),
    index("app_user_active_idx").on(t.lastActiveAt).where(sql`${t.status} = 'active'`),
  ],
);

/** Proof of consent, versioned and historised (GDPR art. 7). */
export const consent = pgTable(
  "consent",
  {
    id: id(),
    userId: uuid()
      .notNull()
      .references(() => appUser.id, { onDelete: "cascade" }),
    kind: text({ enum: CONSENT_KINDS }).notNull(),
    version: text().notNull(),
    grantedAt: createdAt(),
    withdrawnAt: timestamp({ withTimezone: true }),
  },
  (t) => [check("consent_kind_check", oneOf(t.kind, CONSENT_KINDS)), index().on(t.userId, t.kind)],
);

/** Pre-launch waiting list (ONB-01). Stores no email, only its HMAC. */
export const waitlistEntry = pgTable("waitlist_entry", {
  id: id(),
  emailHmac: text().notNull().unique(),
  schoolId: uuid()
    .notNull()
    .references(() => school.id, { onDelete: "restrict" }),
  referralCode: text().notNull().unique(),
  referredBy: uuid(),
  createdAt: createdAt(),
});

/**
 * Legal retention after an account is closed (docs/08-juridique-rgpd.md,
 * décret n° 2021-1362): only the identity already collected, in a separate
 * table that only the purge job and authorised staff read.
 */
export const identityVault = pgTable("identity_vault", {
  id: id(),
  /** Not a foreign key: the account itself is deleted. */
  formerUserId: uuid().notNull(),
  email: text().notNull(),
  firstName: text(),
  birthDate: text(),
  closedAt: createdAt(),
  purgeAfter: timestamp({ withTimezone: true }).notNull(),
});

/**
 * Answers given during onboarding that have no final home until the profile
 * is created (ONB-06: saved at every step, resumable). Deleted on completion.
 * Sensitive preferences never transit here: they go straight to `preferences`.
 */
export interface OnboardingDraftData {
  firstName?: string;
  birthDate?: string;
  gender?: Gender;
  pronouns?: string | null;
  graduationYear?: number;
  program?: string | null;
  intentions?: string[];
  audienceSetAt?: string;
  campusDeclaredAt?: string;
  charterAcceptedAt?: string;
}

export const onboardingDraft = pgTable("onboarding_draft", {
  userId: uuid()
    .primaryKey()
    .references(() => appUser.id, { onDelete: "cascade" }),
  data: jsonb().$type<OnboardingDraftData>().notNull().default({}),
  ...timestamps,
});

export const SIGNUP_BLOCK_REASONS = ["underage"] as const;

/**
 * Addresses that cannot sign up again before a date: a person who declared
 * being under 18 has their account deleted, and only the HMAC of their
 * address is kept, until their 18th birthday (ONB-04).
 */
export const signupBlock = pgTable(
  "signup_block",
  {
    emailHmac: text().primaryKey(),
    reason: text({ enum: SIGNUP_BLOCK_REASONS }).notNull(),
    until: date({ mode: "string" }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [check("signup_block_reason_check", oneOf(t.reason, SIGNUP_BLOCK_REASONS))],
);

export const DATA_EXPORT_STATUSES = ["pending", "ready", "failed"] as const;

/** Self-service data exports (SAF-14): a zip in object storage, downloadable by its owner for 7 days. */
export const dataExport = pgTable(
  "data_export",
  {
    id: id(),
    userId: uuid()
      .notNull()
      .references(() => appUser.id, { onDelete: "cascade" }),
    status: text({ enum: DATA_EXPORT_STATUSES }).notNull().default("pending"),
    storageKey: text(),
    createdAt: createdAt(),
    readyAt: timestamp({ withTimezone: true }),
    expiresAt: timestamp({ withTimezone: true }),
  },
  (t) => [check("data_export_status_check", oneOf(t.status, DATA_EXPORT_STATUSES)), index().on(t.userId)],
);
