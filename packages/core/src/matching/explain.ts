import { type AnswerSheet, IMPORTANCE_WEIGHTS } from "./compatibility";

/**
 * Readable reasons behind a compatibility score (DEC-05, docs/06-matching.md):
 * the two most heavily weighted agreements and, for fun, one minor
 * disagreement ("Personne n'est parfait."). Only questions both members
 * answered are used, and nothing is revealed that the other person's profile
 * would not already show: an agreement means the same answer on both sides.
 */
export interface Agreement {
  readonly questionId: string;
  /** The answer both members gave. */
  readonly answer: string;
  /** Combined importance, for ordering. */
  readonly weight: number;
}

export interface Disagreement {
  readonly questionId: string;
  readonly viewerAnswer: string;
  readonly otherAnswer: string;
}

export interface CompatibilityExplanation {
  readonly agreements: readonly Agreement[];
  readonly quirk: Disagreement | null;
}

/** Questions that make good light-hearted disagreements, in order of preference. */
export interface ExplainOptions {
  readonly maxAgreements?: number;
  /** Ids of questions suited to a humorous disagreement (e.g. the "nerd" section). */
  readonly playfulQuestionIds?: ReadonlySet<string>;
}

export function explainCompatibility(
  viewer: AnswerSheet,
  other: AnswerSheet,
  options: ExplainOptions = {},
): CompatibilityExplanation {
  const maxAgreements = options.maxAgreements ?? 2;
  const playful = options.playfulQuestionIds ?? new Set<string>();

  const agreements: Agreement[] = [];
  const disagreements: (Disagreement & { score: number })[] = [];

  for (const [questionId, mine] of viewer) {
    const theirs = other.get(questionId);
    if (!theirs) {
      continue;
    }
    const weight = IMPORTANCE_WEIGHTS[mine.importance] + IMPORTANCE_WEIGHTS[theirs.importance];
    if (mine.answer === theirs.answer) {
      if (weight > 0) {
        agreements.push({ questionId, answer: mine.answer, weight });
      }
      continue;
    }
    // A quirk must stay harmless: neither member cares much about it.
    const minor = weight <= IMPORTANCE_WEIGHTS.somewhat * 2;
    if (minor) {
      disagreements.push({
        questionId,
        viewerAnswer: mine.answer,
        otherAnswer: theirs.answer,
        score: (playful.has(questionId) ? 100 : 0) - weight,
      });
    }
  }

  agreements.sort((a, b) => b.weight - a.weight || a.questionId.localeCompare(b.questionId));
  disagreements.sort((a, b) => b.score - a.score || a.questionId.localeCompare(b.questionId));
  const quirk = disagreements[0];

  return {
    agreements: agreements.slice(0, maxAgreements),
    quirk: quirk
      ? { questionId: quirk.questionId, viewerAnswer: quirk.viewerAnswer, otherAnswer: quirk.otherAnswer }
      : null,
  };
}
