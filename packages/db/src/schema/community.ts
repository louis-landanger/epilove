import { AVAILABILITY_ACTIVITIES, AVAILABILITY_AREAS, GRANTED_BADGES } from "@epilove/core";
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
import { createdAt, id, oneOf, timestamps } from "./columns";
import type { QuestionOption } from "./questionnaire";
import { appUser } from "./users";

/**
 * Question of the week (COM-01): a bank of light campus polls, one per ISO
 * week in rotation. Never about religion, politics, health or origin.
 */
export const weeklyQuestion = pgTable("weekly_question", {
  id: id(),
  slug: text().notNull().unique(),
  textFr: text().notNull(),
  textEn: text().notNull(),
  options: jsonb().$type<QuestionOption[]>().notNull(),
  position: integer().notNull().default(0),
  active: boolean().notNull().default(true),
  ...timestamps,
});

/** One answer per member and week; results are only shown as aggregates of 10 people or more. */
export const weeklyAnswer = pgTable(
  "weekly_answer",
  {
    /** ISO week in campus time, e.g. "2026-W40". */
    week: text().notNull(),
    userId: uuid()
      .notNull()
      .references(() => appUser.id, { onDelete: "cascade" }),
    questionId: uuid()
      .notNull()
      .references(() => weeklyQuestion.id, { onDelete: "restrict" }),
    option: text().notNull(),
    ...timestamps,
  },
  (t) => [
    primaryKey({ columns: [t.week, t.userId] }),
    index("weekly_answer_question_idx").on(t.questionId, t.week),
    index("weekly_answer_user_idx").on(t.userId),
  ],
);

/**
 * Badges granted by a person (COM-04): "photo_verified" when a moderator
 * approves the gesture selfie (ONB-08), "ambassador" by the team. "Founder"
 * is computed from the sign-up date and never stored.
 */
export const memberBadge = pgTable(
  "member_badge",
  {
    userId: uuid()
      .notNull()
      .references(() => appUser.id, { onDelete: "cascade" }),
    badge: text({ enum: GRANTED_BADGES }).notNull(),
    grantedAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.badge] }),
    check("member_badge_check", oneOf(t.badge, GRANTED_BADGES)),
  ],
);

/** "Dispo" status (IRL-05): one per member, shown to matches until `until`. */
export const availability = pgTable(
  "availability",
  {
    userId: uuid()
      .primaryKey()
      .references(() => appUser.id, { onDelete: "cascade" }),
    activity: text({ enum: AVAILABILITY_ACTIVITIES }).notNull(),
    area: text({ enum: AVAILABILITY_AREAS }).notNull(),
    until: timestamp({ withTimezone: true }).notNull(),
    ...timestamps,
  },
  (t) => [
    check("availability_activity_check", oneOf(t.activity, AVAILABILITY_ACTIVITIES)),
    check("availability_area_check", oneOf(t.area, AVAILABILITY_AREAS)),
  ],
);
