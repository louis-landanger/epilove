import {
  answerSheets,
  answersOf,
  listActiveQuestions,
  saveAnswer,
} from "@epilove/db/repositories/questionnaire";
import { ORPCError } from "@orpc/server";
import { os, requireViewer } from "../procedures";
import { requireMemberRow, requireVisibleProfile } from "../rencontre/access";
import { compatibilityView, optionLabel, questionText } from "../rencontre/compatibility";

export const questionnaire = {
  get: os.questionnaire.get.use(requireViewer).handler(async ({ context, input }) => {
    const db = context.database();
    await requireMemberRow(db, context.viewer.userId);
    const [questions, answers] = await Promise.all([
      listActiveQuestions(db),
      answersOf(db, context.viewer.userId),
    ]);
    return {
      questions: questions.map((q) => ({
        id: q.id,
        slug: q.slug,
        section: q.section,
        text: questionText(q, input.locale),
        options: q.options.map((o) => ({ value: o.value, label: optionLabel(q, o.value, input.locale) })),
      })),
      answers,
    };
  }),

  answer: os.questionnaire.answer.use(requireViewer).handler(async ({ context, input }) => {
    const db = context.database();
    await requireMemberRow(db, context.viewer.userId);
    const result = await saveAnswer(db, context.viewer.userId, input);
    if (!result.ok) {
      throw new ORPCError("BAD_REQUEST", { message: result.reason });
    }
    const total = (await listActiveQuestions(db)).length;
    return { answered: result.answered, total };
  }),

  compatibility: os.questionnaire.compatibility.use(requireViewer).handler(async ({ context, input }) => {
    const db = context.database();
    await requireVisibleProfile(db, context.viewer.userId, input.userId);
    const [questions, sheets] = await Promise.all([
      listActiveQuestions(db),
      answerSheets(db, [context.viewer.userId, input.userId]),
    ]);
    return compatibilityView(
      questions,
      sheets.get(context.viewer.userId) ?? new Map(),
      sheets.get(input.userId) ?? new Map(),
      input.locale,
    );
  }),
};
