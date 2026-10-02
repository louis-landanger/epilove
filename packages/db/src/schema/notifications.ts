import { sql } from "drizzle-orm";
import { boolean, index, jsonb, pgTable, primaryKey, text, timestamp, uuid } from "drizzle-orm/pg-core";
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
