import { MODES } from "@epilove/core";
import { sql } from "drizzle-orm";
import { check, date, index, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { createdAt, id, oneOf } from "./columns";
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
    status: text({ enum: MATCH_STATUSES }).notNull().default("active"),
    unmatchedBy: uuid().references(() => appUser.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    lastMessageAt: timestamp({ withTimezone: true }),
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
  (t) => [unique().on(t.userId, t.day)],
);
