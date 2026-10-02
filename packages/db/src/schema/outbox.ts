import { sql } from "drizzle-orm";
import { index, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createdAt, id } from "./columns";

/**
 * Transactional outbox: realtime events written in the same transaction as the
 * business change, then published to Centrifugo by the worker.
 */
export const outbox = pgTable(
  "outbox",
  {
    id: id(),
    topic: text().notNull(),
    payload: jsonb().notNull(),
    createdAt: createdAt(),
    publishedAt: timestamp({ withTimezone: true }),
  },
  (t) => [index("outbox_pending_idx").on(t.createdAt).where(sql`${t.publishedAt} is null`)],
);
