import { DISCOVERY_RULES } from "./rules";

/**
 * Deck ranking (docs/06-matching.md, sections 5 to 7).
 *
 * 1. Reciprocal score R(A,B) = sqrt(p(A likes B) · p(B likes A)): the deck
 *    looks for pairs likely to like each other, not for "who A will like".
 * 2. Fairness: small boosts (newcomers, active today, cross-school) and an
 *    exposure factor that calms down members who are already overwhelmed.
 * 3. Diversification (Maximal Marginal Relevance) so that the deck does not
 *    show ten people from the same school and year in a row.
 * 4. About one card in four is someone who already liked the viewer.
 *
 * Launch version: hand-tuned logistic weights, to be replaced by a model
 * trained on real decisions once there is enough data.
 */

export interface RankingSelf {
  readonly id: string;
  readonly schoolSlug: string;
  readonly graduationYear: number;
  /** "Bonus inter-écoles" setting (docs/06, section 12). */
  readonly crossSchoolBoost: boolean;
  /** Profile quality in [0, 1] (photos, prompts). */
  readonly completeness: number;
  readonly daysSinceActive: number;
}

export interface RankingCandidate {
  readonly id: string;
  readonly schoolSlug: string;
  readonly graduationYear: number;
  /** Questionnaire compatibility in [0, 1], or null below 12 common questions. */
  readonly compatibility: number | null;
  /** Jaccard similarity of interests in [0, 1]. */
  readonly interestSimilarity: number;
  readonly completeness: number;
  readonly daysSinceActive: number;
  readonly accountAgeHours: number;
  /** Likes received and not answered yet (attention cap). */
  readonly pendingLikesReceived: number;
  /** Deck appearances today (impression budget). */
  readonly impressionsToday: number;
  /** The candidate already liked the viewer. */
  readonly likedViewer: boolean;
  /**
   * Share of identical answers to the recent questions of the week (COM-01),
   * in [0, 1]; null or absent when too few were answered by both.
   */
  readonly weeklyAgreement?: number | null;
}

export const RANKING_WEIGHTS = {
  intercept: -1.2,
  compatibility: 3,
  /** Compatibility assumed when it is unknown (too few common questions). */
  unknownCompatibility: 0.45,
  interests: 1,
  /** Centred on 0.5: answering alike helps a little, answering apart costs a little. */
  weeklyAgreement: 0.6,
  completeness: 0.8,
  recency: 0.6,
  yearGap: 0.35,
  /** Probability used when the candidate already liked the viewer. */
  alreadyLiked: 0.95,
  newcomerBoost: 0.25,
  activeTodayBoost: 0.1,
  crossSchoolBoost: 0.15,
  /** Pending likes above which exposure is reduced. */
  attentionCap: 10,
  /** Target daily impressions per profile. */
  impressionTarget: 40,
  /** MMR trade-off between relevance (1) and diversity (0). */
  diversity: 0.75,
  /** One card in `likerEvery` is a member who liked the viewer. */
  likerEvery: 4,
} as const;

const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

/** Recency signal in [0, 1]: 1 when active today, fading over the 21-day window. */
const recency = (days: number) => clamp01(1 - days / 21);

function likeProbability(
  compatibility: number | null,
  interests: number,
  target: { completeness: number; daysSinceActive: number },
  yearGap: number,
  weeklyAgreement: number | null,
): number {
  const w = RANKING_WEIGHTS;
  return sigmoid(
    w.intercept +
      w.compatibility * (compatibility ?? w.unknownCompatibility) +
      w.interests * interests +
      w.weeklyAgreement * ((weeklyAgreement ?? 0.5) - 0.5) +
      w.completeness * clamp01(target.completeness) +
      w.recency * recency(target.daysSinceActive) -
      w.yearGap * Math.min(4, yearGap),
  );
}

/** Reciprocal score R(A,B), in (0, 1). */
export function reciprocalScore(self: RankingSelf, candidate: RankingCandidate): number {
  const gap = Math.abs(self.graduationYear - candidate.graduationYear);
  const agreement = candidate.weeklyAgreement ?? null;
  const pViewer = likeProbability(
    candidate.compatibility,
    candidate.interestSimilarity,
    candidate,
    gap,
    agreement,
  );
  const pCandidate = candidate.likedViewer
    ? RANKING_WEIGHTS.alreadyLiked
    : likeProbability(candidate.compatibility, candidate.interestSimilarity, self, gap, agreement);
  return Math.sqrt(pViewer * pCandidate);
}

/** Exposure factor π in (0, 1]: lower for members who are swamped or over-exposed today. */
export function exposureFactor(
  candidate: Pick<RankingCandidate, "pendingLikesReceived" | "impressionsToday">,
) {
  const w = RANKING_WEIGHTS;
  const overload = Math.max(0, candidate.pendingLikesReceived - w.attentionCap);
  const overExposure = Math.max(0, candidate.impressionsToday - w.impressionTarget);
  return (1 / (1 + overload / w.attentionCap)) * Math.exp(-overExposure / w.impressionTarget);
}

/** Final ranking score of docs/06, section 6. */
export function rankingScore(self: RankingSelf, candidate: RankingCandidate): number {
  const w = RANKING_WEIGHTS;
  const boosts =
    (candidate.accountAgeHours < DISCOVERY_RULES.newcomerBoostHours ? w.newcomerBoost : 0) +
    (candidate.daysSinceActive === 0 ? w.activeTodayBoost : 0) +
    (self.crossSchoolBoost && candidate.schoolSlug !== self.schoolSlug ? w.crossSchoolBoost : 0);
  return reciprocalScore(self, candidate) * (1 + boosts) * exposureFactor(candidate);
}

export interface Ranked {
  readonly id: string;
  readonly score: number;
  readonly likedViewer: boolean;
}

function similarity(a: RankingCandidate, b: RankingCandidate): number {
  return (a.schoolSlug === b.schoolSlug ? 0.6 : 0) + (a.graduationYear === b.graduationYear ? 0.4 : 0);
}

/** Greedy Maximal Marginal Relevance over candidates sorted by score. */
function diversify(scored: readonly { candidate: RankingCandidate; score: number }[]) {
  const lambda = RANKING_WEIGHTS.diversity;
  const remaining = [...scored];
  const picked: { candidate: RankingCandidate; score: number }[] = [];
  while (remaining.length > 0) {
    let bestIndex = 0;
    let bestValue = Number.NEGATIVE_INFINITY;
    // Only the last few picks matter, the most recent one the most.
    const recent = picked.slice(-3).reverse();
    for (let i = 0; i < remaining.length; i++) {
      const item = remaining[i] as (typeof remaining)[number];
      const redundancy = recent.reduce(
        (max, p, age) => Math.max(max, similarity(item.candidate, p.candidate) / 2 ** age),
        0,
      );
      const value = lambda * item.score - (1 - lambda) * redundancy * (picked[0]?.score ?? item.score);
      if (value > bestValue) {
        bestValue = value;
        bestIndex = i;
      }
    }
    picked.push(...remaining.splice(bestIndex, 1));
  }
  return picked;
}

/**
 * Orders deck candidates. Every candidate passed in must already be allowed by
 * `canSee`/`isDeckCandidate`: ranking never decides who is visible, only the order.
 */
export function rankDeck(self: RankingSelf, candidates: readonly RankingCandidate[]): Ranked[] {
  const scored = candidates
    .map((candidate) => ({ candidate, score: rankingScore(self, candidate) }))
    .sort((a, b) => b.score - a.score || a.candidate.id.localeCompare(b.candidate.id));

  const likers = diversify(scored.filter((s) => s.candidate.likedViewer));
  const others = diversify(scored.filter((s) => !s.candidate.likedViewer));

  const deck: Ranked[] = [];
  const every = RANKING_WEIGHTS.likerEvery;
  while (likers.length > 0 || others.length > 0) {
    const likerSlot = deck.length % every === every - 1;
    const next = (likerSlot && likers.length > 0) || others.length === 0 ? likers.shift() : others.shift();
    if (next) {
      deck.push({ id: next.candidate.id, score: next.score, likedViewer: next.candidate.likedViewer });
    }
  }
  return deck;
}

/** Jaccard similarity of two sets of interest ids. */
export function jaccard(a: ReadonlySet<string>, b: ReadonlySet<string>): number {
  if (a.size === 0 && b.size === 0) {
    return 0;
  }
  let shared = 0;
  for (const item of a) {
    if (b.has(item)) {
      shared++;
    }
  }
  return shared / (a.size + b.size - shared);
}
