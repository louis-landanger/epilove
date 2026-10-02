import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { createdAt, id, timestamps } from "./columns";
import { appUser } from "./users";

/** In-app notification centre (NOT-02). */
export const notification = pgTable(
  "notification",
  {
    id: id(),
    userId: uuid()
      .notNull()
      .references(() => appUser.id, { onDelete: "cascade" }),
    type: text().notNull(),
    payload: jsonb(),
    readAt: timestamp({ withTimezone: true }),
    /** Set once push delivery was attempted or skipped (preferences, member online). */
    pushedAt: timestamp({ withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    index().on(t.userId, t.createdAt.desc()),
    index("notification_push_pending_idx").on(t.createdAt).where(sql`${t.pushedAt} is null`),
  ],
);

/** Web Push subscriptions (NOT-01), one per device. */
export const pushSubscription = pgTable("push_subscription", {
  id: id(),
  userId: uuid()
    .notNull()
    .references(() => appUser.id, { onDelete: "cascade" }),
  endpoint: text().notNull().unique(),
  p256dh: text().notNull(),
  auth: text().notNull(),
  userAgent: text(),
  lastSuccessAt: timestamp({ withTimezone: true }),
  createdAt: createdAt(),
});

/**
 * Notification preferences per group and channel (NOT-03). No row means the
 * defaults of @epilove/notifications (push on, email off).
 */
export const notificationPreference = pgTable(
  "notification_preference",
  {
    userId: uuid()
      .notNull()
      .references(() => appUser.id, { onDelete: "cascade" }),
    group: text().notNull(),
    push: boolean().notNull(),
    email: boolean().notNull(),
    ...timestamps,
  },
  (t) => [primaryKey({ columns: [t.userId, t.group] })],
);

/** Quiet hours (NOT-04); no row means the defaults (23:00 to 08:00, messages held). */
export const quietHours = pgTable(
  "quiet_hours",
  {
    userId: uuid()
      .primaryKey()
      .references(() => appUser.id, { onDelete: "cascade" }),
    enabled: boolean().notNull(),
    startHour: integer().notNull(),
    endHour: integer().notNull(),
    allowMessages: boolean().notNull(),
    ...timestamps,
  },
  (t) => [
    check("quiet_hours_start_check", sql`${t.startHour} between 0 and 23`),
    check("quiet_hours_end_check", sql`${t.endHour} between 0 and 23`),
  ],
);

/** Weekly e-mail digest (NOT-05): one row per member and ISO week, claimed before sending. */
export const emailDigest = pgTable(
  "email_digest",
  {
    userId: uuid()
      .notNull()
      .references(() => appUser.id, { onDelete: "cascade" }),
    week: text().notNull(),
    sentAt: timestamp({ withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.week] })],
);
