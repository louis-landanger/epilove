import { MODES } from "@atomes/core";
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { createdAt, id, oneOf, subsetOf } from "./columns";
import { appUser } from "./users";

export const LIKE_KINDS = ["like", "superlike", "pass"] as const;
export const LIKE_TARGETS = ["photo", "prompt"] as const;
export const MATCH_SOURCES = ["like", "crush", "pact", "flash"] as const;
export const MATCH_STATUSES = ["active", "unmatched"] as const;

/** One decision per pair and direction (DEC-01, DEC-02). */
export const likeAction = pgTable(
  "like_action",
  {
    id: id(),
    actorId: uuid()
      .notNull()
      .references(() => appUser.id, { onDelete: "cascade" }),
    targetId: uuid()
      .notNull()
      .references(() => appUser.id, { onDelete: "cascade" }),
    kind: text({ enum: LIKE_KINDS }).notNull(),
    /** What was liked: a photo or a prompt answer (Hinge-style targeted like). */
    targetContentType: text({ enum: LIKE_TARGETS }),
    targetContentId: uuid(),
    comment: text(),
    /** Given in the blind deck (DEC-10): no photo was seen. */
    blind: boolean().notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [
    unique().on(t.actorId, t.targetId),
    check("like_action_not_self", sql`${t.actorId} <> ${t.targetId}`),
    check("like_action_kind_check", oneOf(t.kind, LIKE_KINDS)),
    check("like_action_comment_length", sql`${t.comment} is null or char_length(${t.comment}) <= 150`),
    index().on(t.targetId, t.createdAt),
  ],
);

/**
 * A match between two members. The pair is stored ordered (`userLow < userHigh`)
 * with a unique constraint: two matches for the same pair cannot exist.
 */
export const match = pgTable(
  "match",
  {
    id: id(),
    userLow: uuid()
      .notNull()
      .references(() => appUser.id, { onDelete: "cascade" }),
    userHigh: uuid()
      .notNull()
      .references(() => appUser.id, { onDelete: "cascade" }),
    mode: text({ enum: MODES }).notNull(),
    source: text({ enum: MATCH_SOURCES }).notNull(),
    /** Made from a blind like (DEC-10): photos hidden until both sent ten messages. */
    blind: boolean().notNull().default(false),
    status: text({ enum: MATCH_STATUSES }).notNull().default("active"),
    unmatchedBy: uuid().references(() => appUser.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    lastMessageAt: timestamp({ withTimezone: true }),
    /** Last gentle nudge after a silence (CHAT-09). */
    nudgedAt: timestamp({ withTimezone: true }),
  },
  (t) => [
    unique().on(t.userLow, t.userHigh),
    check("match_ordered_pair", sql`${t.userLow} < ${t.userHigh}`),
    check("match_mode_check", oneOf(t.mode, MODES)),
    check("match_source_check", oneOf(t.source, MATCH_SOURCES)),
    check("match_status_check", oneOf(t.status, MATCH_STATUSES)),
    index().on(t.userHigh),
  ],
);

/** The nightly Drop (DEC-07): five curated profiles per member and per day. */
export const drop = pgTable(
  "drop",
  {
    id: id(),
    userId: uuid()
      .notNull()
      .references(() => appUser.id, { onDelete: "cascade" }),
    day: date({ mode: "string" }).notNull(),
    candidates: uuid().array().notNull(),
    openedAt: timestamp({ withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [unique().on(t.userId, t.day), index().on(t.day)],
);

/**
 * One row per Drop day: claimed when the computation starts (20:30), marked
 * computed, then published (21:00). Keeps the scheduler idempotent.
 */
export const dropRun = pgTable("drop_run", {
  day: date({ mode: "string" }).primaryKey(),
  startedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  computedAt: timestamp({ withTimezone: true }),
  publishedAt: timestamp({ withTimezone: true }),
  /** Aggregates only (members, Drops, appearances). */
  stats: jsonb(),
});

export const IMPRESSION_SURFACES = ["deck", "drop", "profile"] as const;

/**
 * How often a profile was shown, per viewer, surface and campus day. Feeds the
 * exposure fairness of the ranking (docs/06-matching.md, section 6).
 */
export const impression = pgTable(
  "impression",
  {
    viewerId: uuid()
      .notNull()
      .references(() => appUser.id, { onDelete: "cascade" }),
    targetId: uuid()
      .notNull()
      .references(() => appUser.id, { onDelete: "cascade" }),
    surface: text({ enum: IMPRESSION_SURFACES }).notNull(),
    day: date({ mode: "string" }).notNull(),
    count: integer().notNull().default(1),
  },
  (t) => [
    primaryKey({ columns: [t.viewerId, t.targetId, t.surface, t.day] }),
    check("impression_surface_check", oneOf(t.surface, IMPRESSION_SURFACES)),
    index().on(t.targetId, t.day),
  ],
);

export const DECK_MODES = ["all", ...MODES] as const;

/**
 * Deck filters (DEC-06). They only narrow what the viewer sees, in one
 * direction; the two-way rules (age preferences, orientation, hiding) live in
 * `preferences` and are applied by `canSee`.
 */
export const discoveryFilter = pgTable(
  "discovery_filter",
  {
    userId: uuid()
      .primaryKey()
      .references(() => appUser.id, { onDelete: "cascade" }),
    mode: text({ enum: DECK_MODES }).notNull().default("all"),
    schoolSlugs: text().array().notNull().default(sql`'{}'`),
    graduationYears: smallint().array().notNull().default(sql`'{}'`),
    intentions: text().array().notNull().default(sql`'{}'`),
    ageMin: smallint(),
    ageMax: smallint(),
    updatedAt: timestamp({ withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    check("discovery_filter_mode_check", oneOf(t.mode, DECK_MODES)),
    check(
      "discovery_filter_intentions_check",
      subsetOf(t.intentions, ["relationship", "see_what_happens", "friendship"]),
    ),
    check(
      "discovery_filter_age_check",
      sql`(${t.ageMin} is null or ${t.ageMin} >= 18) and (${t.ageMax} is null or ${t.ageMin} is null or ${t.ageMax} >= ${t.ageMin})`,
    ),
  ],
);

/** Daily "undo the last pass" (DEC-11): one row per member and campus day. */
export const discoveryUndo = pgTable(
  "discovery_undo",
  {
    userId: uuid()
      .notNull()
      .references(() => appUser.id, { onDelete: "cascade" }),
    day: date({ mode: "string" }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.day] })],
);

/**
 * Secret crushes (DEC-08): only the HMAC fingerprint of the target's school
 * email is stored, never the address. Withdrawn crushes stay (soft delete) to
 * count additions against the anti-probing limit.
 */
export const secretCrush = pgTable(
  "secret_crush",
  {
    id: id(),
    userId: uuid()
      .notNull()
      .references(() => appUser.id, { onDelete: "cascade" }),
    targetEmailHmac: text().notNull(),
    /** First letter and school domain ("a•••@epita.fr"), for the member's own list. */
    hint: text().notNull(),
    createdAt: createdAt(),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    matchedAt: timestamp({ withTimezone: true }),
    withdrawnAt: timestamp({ withTimezone: true }),
  },
  (t) => [unique().on(t.userId, t.targetEmailHmac), index().on(t.targetEmailHmac)],
);
