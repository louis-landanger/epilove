import { IMPORTANCES } from "@atomes/core";
import { boolean, check, integer, jsonb, pgTable, primaryKey, text, uuid } from "drizzle-orm/pg-core";
import { id, oneOf, timestamps } from "./columns";
import { appUser } from "./users";

export interface QuestionOption {
  readonly value: string;
  readonly labelFr: string;
  readonly labelEn: string;
}

/** Compatibility and Pact questions (docs/06-matching.md, section 3). Versioned, never deleted. */
export const question = pgTable("question", {
  id: id(),
  slug: text().notNull().unique(),
  section: text().notNull(),
  textFr: text().notNull(),
  textEn: text().notNull(),
  options: jsonb().$type<QuestionOption[]>().notNull(),
  version: integer().notNull().default(1),
  position: integer().notNull().default(0),
  active: boolean().notNull().default(true),
  pactOnly: boolean().notNull().default(false),
  ...timestamps,
});

export const questionAnswer = pgTable(
  "question_answer",
  {
    userId: uuid()
      .notNull()
      .references(() => appUser.id, { onDelete: "cascade" }),
    questionId: uuid()
      .notNull()
      .references(() => question.id, { onDelete: "restrict" }),
    answer: text().notNull(),
    acceptable: text().array().notNull(),
    importance: text({ enum: IMPORTANCES }).notNull(),
    ...timestamps,
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.questionId] }),
    check("question_answer_importance_check", oneOf(t.importance, IMPORTANCES)),
  ],
);
