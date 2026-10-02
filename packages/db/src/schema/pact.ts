import { MODES } from "@epilove/core";
import { sql } from "drizzle-orm";
import { check, jsonb, pgTable, primaryKey, real, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { createdAt, id, oneOf, subsetOf } from "./columns";
import { appUser } from "./users";

export const PACT_STATUSES = ["draft", "open", "closed", "computed", "revealed"] as const;

/** A Pact edition (PAC-05): Valentine's, back-to-school… */
export const pactSeason = pgTable(
  "pact_season",
  {
    id: id(),
    slug: text().notNull().unique(),
    name: text().notNull(),
    opensAt: timestamp({ withTimezone: true }).notNull(),
    closesAt: timestamp({ withTimezone: true }).notNull(),
    revealAt: timestamp({ withTimezone: true }).notNull(),
    status: text({ enum: PACT_STATUSES }).notNull().default("draft"),
    threshold: real().notNull().default(0.6),
    createdAt: createdAt(),
  },
  (t) => [
    check("pact_season_status_check", oneOf(t.status, PACT_STATUSES)),
    check("pact_season_dates_check", sql`${t.opensAt} < ${t.closesAt} and ${t.closesAt} < ${t.revealAt}`),
  ],
);

export const pactParticipant = pgTable(
  "pact_participant",
  {
    seasonId: uuid()
      .notNull()
      .references(() => pactSeason.id, { onDelete: "cascade" }),
    userId: uuid()
      .notNull()
      .references(() => appUser.id, { onDelete: "cascade" }),
    modes: text().array().notNull(),
    completedAt: timestamp({ withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.seasonId, t.userId] }),
    check("pact_participant_modes_check", subsetOf(t.modes, MODES)),
  ],
);

/** One result per pair. "At most one match per person and mode" is checked by the solver's tests. */
export const pactResult = pgTable(
  "pact_result",
  {
    id: id(),
    seasonId: uuid()
      .notNull()
      .references(() => pactSeason.id, { onDelete: "cascade" }),
    mode: text({ enum: MODES }).notNull(),
    userLow: uuid()
      .notNull()
      .references(() => appUser.id, { onDelete: "cascade" }),
    userHigh: uuid()
      .notNull()
      .references(() => appUser.id, { onDelete: "cascade" }),
    score: real().notNull(),
    explanation: jsonb(),
    createdAt: createdAt(),
  },
  (t) => [
    unique().on(t.seasonId, t.mode, t.userLow, t.userHigh),
    check("pact_result_ordered_pair", sql`${t.userLow} < ${t.userHigh}`),
    check("pact_result_mode_check", oneOf(t.mode, MODES)),
  ],
);
