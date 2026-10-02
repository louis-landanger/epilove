import { index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { createdAt, id } from "./columns";
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
    createdAt: createdAt(),
  },
  (t) => [index().on(t.userId, t.createdAt.desc())],
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
