import { EVENT_STATUSES, RSVP_STATUSES } from "@atomes/core";
import { sql } from "drizzle-orm";
import { boolean, check, index, pgTable, primaryKey, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { id, oneOf, timestamps } from "./columns";
import { spot } from "./spots";
import { appUser } from "./users";

/**
 * Campus events (IRL-01), published by student associations (role
 * "organizer"). `school_ids` empty means the whole campus.
 */
export const event = pgTable(
  "event",
  {
    id: id(),
    /** The organizer's account; kept null when it is deleted, so that past events stay listed. */
    organizerId: uuid().references(() => appUser.id, { onDelete: "set null" }),
    /** The association shown to members (never the organizer's own name). */
    organizerName: text().notNull(),
    title: text().notNull(),
    description: text().notNull().default(""),
    /** Free text, or the Spot's name when one was picked. */
    venue: text().notNull(),
    spotId: uuid().references(() => spot.id, { onDelete: "set null" }),
    startsAt: timestamp({ withTimezone: true }).notNull(),
    endsAt: timestamp({ withTimezone: true }),
    coverKey: text(),
    schoolIds: uuid().array().notNull().default(sql`'{}'::uuid[]`),
    status: text({ enum: EVENT_STATUSES }).notNull().default("published"),
    ...timestamps,
  },
  (t) => [
    check("event_status_check", oneOf(t.status, EVENT_STATUSES)),
    index("event_starts_at_idx").on(t.startsAt),
  ],
);

/** "J'y vais" / "Peut-être", and the optional, reciprocal sharing with one's matches. */
export const eventRsvp = pgTable(
  "event_rsvp",
  {
    eventId: uuid()
      .notNull()
      .references(() => event.id, { onDelete: "cascade" }),
    userId: uuid()
      .notNull()
      .references(() => appUser.id, { onDelete: "cascade" }),
    status: text({ enum: RSVP_STATUSES }).notNull(),
    shareWithMatches: boolean().notNull().default(false),
    ...timestamps,
  },
  (t) => [
    primaryKey({ columns: [t.eventId, t.userId] }),
    check("event_rsvp_status_check", oneOf(t.status, RSVP_STATUSES)),
    index("event_rsvp_user_idx").on(t.userId),
  ],
);

/** Flash scans (IRL-04): two scans of each other at the same event make a match. */
export const flashScan = pgTable(
  "flash_scan",
  {
    eventId: uuid()
      .notNull()
      .references(() => event.id, { onDelete: "cascade" }),
    scannerId: uuid()
      .notNull()
      .references(() => appUser.id, { onDelete: "cascade" }),
    scannedId: uuid()
      .notNull()
      .references(() => appUser.id, { onDelete: "cascade" }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.eventId, t.scannerId, t.scannedId] }),
    index("flash_scan_scanner_idx").on(t.scannerId, t.createdAt),
  ],
);
