import { CHECK_IN_ANSWERS } from "@epilove/core";
import { sql } from "drizzle-orm";
import { check, index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { bytea, createdAt, oneOf } from "./columns";
import { match } from "./discovery";
import { message } from "./messaging";
import { appUser } from "./users";

/**
 * Date safety kit (IRL-03): a temporary link to an accepted date's details,
 * for a trusted person who is not a member. Only the token's hash is used to
 * find a share; the token itself and the details are encrypted.
 */
export const dateShare = pgTable(
  "date_share",
  {
    /** Sent by the client (UUIDv7): creating twice returns the same link. */
    id: uuid().primaryKey(),
    userId: uuid()
      .notNull()
      .references(() => appUser.id, { onDelete: "cascade" }),
    matchId: uuid()
      .notNull()
      .references(() => match.id, { onDelete: "cascade" }),
    messageId: uuid()
      .notNull()
      .references(() => message.id, { onDelete: "cascade" }),
    /** SHA-256 of the token in the link. */
    tokenHash: text().notNull().unique(),
    tokenEncrypted: bytea().notNull(),
    /** Who, where and when, as shared at creation (first names, place, time). */
    detailsEncrypted: bytea().notNull(),
    keyId: text().notNull(),
    checkInAt: timestamp({ withTimezone: true }).notNull(),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    checkInNotifiedAt: timestamp({ withTimezone: true }),
    checkInAnswer: text({ enum: CHECK_IN_ANSWERS }),
    checkedInAt: timestamp({ withTimezone: true }),
    revokedAt: timestamp({ withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    check(
      "date_share_answer_check",
      sql`${t.checkInAnswer} is null or ${oneOf(t.checkInAnswer, CHECK_IN_ANSWERS)}`,
    ),
    index("date_share_user_idx").on(t.userId, t.createdAt),
    index("date_share_check_in_idx")
      .on(t.checkInAt)
      .where(sql`${t.checkInNotifiedAt} is null and ${t.revokedAt} is null`),
  ],
);
