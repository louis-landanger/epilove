import { IMPORTANCES } from "@epilove/core";
import { oc } from "@orpc/contract";
import { z } from "zod";

/** Language of catalogue texts (questions, prompts) returned by the API. */
export const CONTENT_LOCALES = ["fr", "en"] as const;
export const contentLocale = z.enum(CONTENT_LOCALES).default("fr");
export const localeInput = z.object({ locale: contentLocale });

export const questionOption = z.object({ value: z.string(), label: z.string() });
export const questionnaireQuestion = z.object({
  id: z.uuid(),
  slug: z.string(),
  section: z.string(),
  text: z.string(),
  options: z.array(questionOption),
});
export type QuestionnaireQuestion = z.infer<typeof questionnaireQuestion>;

export const savedAnswer = z.object({
  questionId: z.uuid(),
  answer: z.string().max(64),
  acceptable: z.array(z.string().max(64)).min(1).max(12),
  importance: z.enum(IMPORTANCES),
});
export type SavedAnswer = z.infer<typeof savedAnswer>;

/** A compatibility score with its readable reasons (DEC-05). `score` is null below 12 common questions. */
export const compatibilityView = z.object({
  score: z.number().min(0).max(1).nullable(),
  commonQuestions: z.number().int(),
  agreements: z.array(z.object({ question: z.string(), answer: z.string() })),
  quirk: z.object({ question: z.string(), mine: z.string(), theirs: z.string() }).nullable(),
});
export type CompatibilityView = z.infer<typeof compatibilityView>;

export const questionnaireContract = {
  /** The active questions and the viewer's own answers (PAC-01). */
  get: oc
    .input(localeInput)
    .output(z.object({ questions: z.array(questionnaireQuestion), answers: z.array(savedAnswer) })),
  /** Saves one answer (idempotent upsert). */
  answer: oc.input(savedAnswer).output(z.object({ answered: z.number().int(), total: z.number().int() })),
  /** Compatibility with another member, with explanations. Requires access to their profile. */
  compatibility: oc.input(z.object({ userId: z.uuid(), locale: contentLocale })).output(compatibilityView),
};
