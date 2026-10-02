import { boolean, index, integer, jsonb, pgTable, primaryKey, text, uuid } from "drizzle-orm/pg-core";
import { id, timestamps } from "./columns";
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
