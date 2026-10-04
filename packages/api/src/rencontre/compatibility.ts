import type { CompatibilityView } from "@atomes/contracts";
import { type AnswerSheet, compatibility, explainCompatibility } from "@atomes/core";
import type { QuestionRow } from "@atomes/db/repositories/questionnaire";

/** Section whose questions make good light-hearted disagreements. */
const PLAYFUL_SECTION = "nerd";

export type ContentLocale = "fr" | "en";

export function questionText(question: QuestionRow, locale: ContentLocale) {
  return locale === "en" ? question.textEn : question.textFr;
}

export function optionLabel(question: QuestionRow, value: string, locale: ContentLocale) {
  const option = question.options.find((o) => o.value === value);
  return option ? (locale === "en" ? option.labelEn : option.labelFr) : value;
}

/** Score and readable reasons between the viewer and another member (DEC-05). */
export function compatibilityView(
  questions: readonly QuestionRow[],
  viewerSheet: AnswerSheet,
  otherSheet: AnswerSheet,
  locale: ContentLocale,
): CompatibilityView {
  const byId = new Map(questions.map((q) => [q.id, q]));
  const result = compatibility(viewerSheet, otherSheet);
  const commonQuestions = [...viewerSheet.keys()].filter((id) => otherSheet.has(id)).length;
  const explanation = explainCompatibility(viewerSheet, otherSheet, {
    playfulQuestionIds: new Set(questions.filter((q) => q.section === PLAYFUL_SECTION).map((q) => q.id)),
  });
  return {
    score: result?.score ?? null,
    commonQuestions,
    agreements: explanation.agreements.flatMap((agreement) => {
      const question = byId.get(agreement.questionId);
      return question
        ? [
            {
              question: questionText(question, locale),
              answer: optionLabel(question, agreement.answer, locale),
            },
          ]
        : [];
    }),
    quirk: (() => {
      const quirk = explanation.quirk;
      const question = quirk && byId.get(quirk.questionId);
      return quirk && question
        ? {
            question: questionText(question, locale),
            mine: optionLabel(question, quirk.viewerAnswer, locale),
            theirs: optionLabel(question, quirk.otherAnswer, locale),
          }
        : null;
    })(),
  };
}
