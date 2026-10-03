import type { AnswerSheet, Importance, QuestionAnswer } from "@epilove/core";
import { and, asc, count, eq, inArray } from "drizzle-orm";
import type { Database } from "../client";
import { question, questionAnswer } from "../schema";

/** Questionnaire storage (PAC-01). Answers are private: only their effect on compatibility is ever shown. */

export async function listActiveQuestions(db: Database) {
  return db
    .select({
      id: question.id,
      slug: question.slug,
      section: question.section,
      textFr: question.textFr,
      textEn: question.textEn,
      options: question.options,
      pactOnly: question.pactOnly,
    })
    .from(question)
    .where(eq(question.active, true))
    .orderBy(asc(question.position), asc(question.slug));
}

export type QuestionRow = Awaited<ReturnType<typeof listActiveQuestions>>[number];

export async function answersOf(db: Database, userId: string) {
  return db
    .select({
      questionId: questionAnswer.questionId,
      answer: questionAnswer.answer,
      acceptable: questionAnswer.acceptable,
      importance: questionAnswer.importance,
    })
    .from(questionAnswer)
    .where(eq(questionAnswer.userId, userId));
}

export interface AnswerInput {
  readonly questionId: string;
  readonly answer: string;
  readonly acceptable: readonly string[];
  readonly importance: Importance;
}

export type SaveAnswerResult =
  | { ok: true; answered: number }
  | { ok: false; reason: "unknown_question" | "invalid_option" };

/** Creates or replaces one answer. Idempotent: saving the same answer twice changes nothing. */
export async function saveAnswer(
  db: Database,
  userId: string,
  input: AnswerInput,
): Promise<SaveAnswerResult> {
  const [target] = await db
    .select({ options: question.options })
    .from(question)
    .where(and(eq(question.id, input.questionId), eq(question.active, true)));
  if (!target) {
    return { ok: false, reason: "unknown_question" };
  }
  const values = new Set(target.options.map((option) => option.value));
  const acceptable = [...new Set(input.acceptable)];
  if (
    !values.has(input.answer) ||
    acceptable.length === 0 ||
    acceptable.some((value) => !values.has(value))
  ) {
    return { ok: false, reason: "invalid_option" };
  }
  await db
    .insert(questionAnswer)
    .values({
      userId,
      questionId: input.questionId,
      answer: input.answer,
      acceptable,
      importance: input.importance,
    })
    .onConflictDoUpdate({
      target: [questionAnswer.userId, questionAnswer.questionId],
      set: { answer: input.answer, acceptable, importance: input.importance, updatedAt: new Date() },
    });
  const [row] = await db
    .select({ value: count() })
    .from(questionAnswer)
    .where(eq(questionAnswer.userId, userId));
  return { ok: true, answered: row?.value ?? 0 };
}

/** Answer sheets of several members, keyed by user id, for compatibility computations. */
export async function answerSheets(
  db: Database,
  userIds: readonly string[],
): Promise<Map<string, AnswerSheet>> {
  const ids = [...new Set(userIds)];
  const sheets = new Map<string, Map<string, QuestionAnswer>>();
  for (const id of ids) {
    sheets.set(id, new Map());
  }
  if (ids.length === 0) {
    return sheets;
  }
  const rows = await db
    .select({
      userId: questionAnswer.userId,
      questionId: questionAnswer.questionId,
      answer: questionAnswer.answer,
      acceptable: questionAnswer.acceptable,
      importance: questionAnswer.importance,
    })
    .from(questionAnswer)
    .innerJoin(question, and(eq(question.id, questionAnswer.questionId), eq(question.active, true)))
    .where(inArray(questionAnswer.userId, ids));
  for (const row of rows) {
    sheets.get(row.userId)?.set(row.questionId, {
      answer: row.answer,
      acceptable: new Set(row.acceptable),
      importance: row.importance,
    });
  }
  return sheets;
}
