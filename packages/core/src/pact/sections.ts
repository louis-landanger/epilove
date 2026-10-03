import { type AnswerSheet, satisfaction } from "../matching/compatibility";

/**
 * Compatibility per questionnaire section, for the radar chart of the Pact
 * result (PAC-03). Mutual satisfaction (geometric mean) over the section's
 * common questions, without the 1/n margin of the global score: a section
 * holds a handful of questions, and the chart compares sections with each
 * other rather than claiming precision. Sections with fewer than
 * `minQuestions` common questions get `null` (not drawn).
 */
export interface SectionScore {
  readonly section: string;
  readonly score: number | null;
}

export function sectionScores(
  a: AnswerSheet,
  b: AnswerSheet,
  sectionOf: ReadonlyMap<string, string>,
  sections: readonly string[],
  minQuestions = 2,
): SectionScore[] {
  const common = new Map<string, string[]>(sections.map((section) => [section, []]));
  for (const questionId of a.keys()) {
    const section = sectionOf.get(questionId);
    if (section && b.has(questionId)) {
      common.get(section)?.push(questionId);
    }
  }
  return sections.map((section) => {
    const questionIds = common.get(section) ?? [];
    if (questionIds.length < minQuestions) {
      return { section, score: null };
    }
    const score = Math.sqrt(satisfaction(a, b, questionIds) * satisfaction(b, a, questionIds));
    return { section, score: Math.round(score * 100) / 100 };
  });
}
