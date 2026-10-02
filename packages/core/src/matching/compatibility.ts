/**
 * Questionnaire compatibility (docs/06-matching.md, section 3).
 *
 * Each answer carries the member's own choice, the choices they accept from
 * the other person, and how much it matters. Satisfaction is the weighted
 * share of the other person's answers that are acceptable; compatibility is
 * the geometric mean of both satisfactions minus a 1/n margin of error.
 */
export const IMPORTANCE_WEIGHTS = {
  irrelevant: 0,
  little: 1,
  somewhat: 10,
  very: 50,
  mandatory: 250,
} as const;

export type Importance = keyof typeof IMPORTANCE_WEIGHTS;

export interface QuestionAnswer {
  readonly answer: string;
  readonly acceptable: ReadonlySet<string>;
  readonly importance: Importance;
}

/** Answers keyed by question id. */
export type AnswerSheet = ReadonlyMap<string, QuestionAnswer>;

/** Below this many common questions, the score is too noisy to display. */
export const MIN_COMMON_QUESTIONS = 12;

export interface Compatibility {
  /** Between 0 and 1. */
  readonly score: number;
  readonly commonQuestions: number;
}

function commonQuestionIds(a: AnswerSheet, b: AnswerSheet): string[] {
  return [...a.keys()].filter((questionId) => b.has(questionId));
}

/**
 * How satisfied `from` is with `to` over `questionIds`, between 0 and 1.
 * Someone who marked every common question as irrelevant is fully satisfied.
 */
export function satisfaction(from: AnswerSheet, to: AnswerSheet, questionIds: readonly string[]): number {
  let earned = 0;
  let possible = 0;
  for (const questionId of questionIds) {
    const own = from.get(questionId);
    const other = to.get(questionId);
    if (!own || !other) {
      continue;
    }
    const weight = IMPORTANCE_WEIGHTS[own.importance];
    possible += weight;
    if (own.acceptable.has(other.answer)) {
      earned += weight;
    }
  }
  return possible === 0 ? 1 : earned / possible;
}

/** Symmetric compatibility, or `null` when there are too few common questions. */
export function compatibility(
  a: AnswerSheet,
  b: AnswerSheet,
  minCommonQuestions: number = MIN_COMMON_QUESTIONS,
): Compatibility | null {
  const common = commonQuestionIds(a, b);
  if (common.length === 0 || common.length < minCommonQuestions) {
    return null;
  }
  const mean = Math.sqrt(satisfaction(a, b, common) * satisfaction(b, a, common));
  return {
    score: Math.max(0, mean - 1 / common.length),
    commonQuestions: common.length,
  };
}

/** True when either member gets an unacceptable answer on a question they marked mandatory. */
export function violatesDealbreaker(a: AnswerSheet, b: AnswerSheet): boolean {
  return commonQuestionIds(a, b).some((questionId) => {
    const fromA = a.get(questionId);
    const fromB = b.get(questionId);
    if (!fromA || !fromB) {
      return false;
    }
    return (
      (fromA.importance === "mandatory" && !fromA.acceptable.has(fromB.answer)) ||
      (fromB.importance === "mandatory" && !fromB.acceptable.has(fromA.answer))
    );
  });
}
