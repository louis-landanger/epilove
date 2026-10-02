import {
  assignDrops,
  type CompiledSheet,
  canSee,
  compileSheets,
  DISCOVERY_RULES,
  DROP_RULES,
  type DropCandidate,
  daysBetween,
  fastCompatibility,
  type IsoDate,
  jaccard,
  matchesDeckFilter,
  reciprocalScore,
} from "@epilove/core";
import type { Database } from "@epilove/db";
import { DEFAULT_DECK_FILTER } from "@epilove/db/repositories/discovery";
import { claimDropRun, deckFiltersOf, saveDrops, swipesBy } from "@epilove/db/repositories/discovery-drop";
import {
  interestIdsOf,
  loadDiscoverableMembers,
  loadRelationsAmong,
  type MemberRow,
} from "@epilove/db/repositories/members";
import { answerSheets } from "@epilove/db/repositories/questionnaire";

const DAY_MS = 86_400_000;
/** No one is excluded from the pre-filter: every discoverable member is both a viewer and a candidate. */
const NOBODY = "00000000-0000-0000-0000-000000000000";

export interface DropStats {
  readonly members: number;
  readonly viewers: number;
  readonly withDrop: number;
  readonly profiles: number;
  readonly maxAppearances: number;
  readonly milliseconds: number;
}

/**
 * Computes the Drops of `day` (DEC-07, docs/06, section 8): for each active
 * member, the candidates the deck would accept (access policies, swipe
 * history, dealbreakers, their own filters), scored by the reciprocal score,
 * then the greedy assignment with the appearance cap. Returns null when
 * another run owns the day.
 */
export async function computeDrops(
  db: Database,
  options: { day: IsoDate; now: Date; force?: boolean },
): Promise<DropStats | null> {
  const { day, now } = options;
  if (!(await claimDropRun(db, day, now, options.force))) {
    return null;
  }
  const started = performance.now();
  const members = await loadDiscoverableMembers(db, NOBODY);
  const ids = members.map((m) => m.member.id);
  const [relations, swipes, sheets, interests, filters] = await Promise.all([
    loadRelationsAmong(db, ids),
    swipesBy(db, ids),
    answerSheets(db, ids),
    interestIdsOf(db, ids),
    deckFiltersOf(db, ids),
  ]);
  const compiled = compileSheets(ids.map((id) => sheets.get(id) ?? new Map()));
  const index = new Map(ids.map((id, position) => [id, position]));
  const context = { today: day, relations };
  const passCooldown = DISCOVERY_RULES.passCooldownDays * DAY_MS;
  const completeness = (row: MemberRow) => Math.max(0, Math.min(1, row.completeness / 100));

  // A restricted account can be seen but cannot like: no Drop for it.
  const viewers = members.filter((m) => m.member.status === "active");
  const pairs: DropCandidate[] = [];
  for (const viewer of viewers) {
    const history = swipes.get(viewer.member.id) ?? new Map();
    const filter = filters.get(viewer.member.id) ?? DEFAULT_DECK_FILTER;
    const viewerSheet = compiled[index.get(viewer.member.id) as number] as CompiledSheet;
    const viewerInterests = interests.get(viewer.member.id) ?? new Set<string>();
    const scored: DropCandidate[] = [];
    for (const target of members) {
      if (target.member.id === viewer.member.id) {
        continue;
      }
      const swipe = history.get(target.member.id);
      if (swipe && (swipe.kind !== "pass" || now.getTime() - swipe.at.getTime() < passCooldown)) {
        continue;
      }
      const decision = canSee(viewer.member, target.member, context);
      if (!decision.visible || !matchesDeckFilter(filter, target, decision.modes, day)) {
        continue;
      }
      const compatibility = fastCompatibility(
        viewerSheet,
        compiled[index.get(target.member.id) as number] as CompiledSheet,
      );
      if (compatibility.dealbreaker) {
        continue;
      }
      const score = reciprocalScore(
        {
          id: viewer.member.id,
          schoolSlug: viewer.member.schoolSlug,
          graduationYear: viewer.member.graduationYear,
          crossSchoolBoost: viewer.crossSchoolBoost,
          completeness: completeness(viewer),
          daysSinceActive: 0,
        },
        {
          id: target.member.id,
          schoolSlug: target.member.schoolSlug,
          graduationYear: target.member.graduationYear,
          compatibility: compatibility.score,
          interestSimilarity: jaccard(viewerInterests, interests.get(target.member.id) ?? new Set()),
          completeness: completeness(target),
          daysSinceActive: Math.max(0, daysBetween(target.member.lastActiveOn, day)),
          accountAgeHours: (now.getTime() - target.createdAt.getTime()) / 3_600_000,
          pendingLikesReceived: 0,
          impressionsToday: 0,
          likedViewer: relations.hasLiked(target.member.id, viewer.member.id),
        },
      );
      scored.push({ viewer: viewer.member.id, candidate: target.member.id, score });
    }
    scored.sort((x, y) => y.score - x.score);
    pairs.push(...scored.slice(0, DROP_RULES.candidatesPerMember));
  }

  const drops = assignDrops(pairs);
  const appearances = new Map<string, number>();
  for (const candidates of drops.values()) {
    for (const candidate of candidates) {
      appearances.set(candidate, (appearances.get(candidate) ?? 0) + 1);
    }
  }
  const stats: DropStats = {
    members: members.length,
    viewers: viewers.length,
    withDrop: [...drops.values()].filter((d) => d.length > 0).length,
    profiles: [...drops.values()].reduce((sum, d) => sum + d.length, 0),
    maxAppearances: Math.max(0, ...appearances.values()),
    milliseconds: Math.round(performance.now() - started),
  };
  await saveDrops(db, { day, drops, stats, now });
  return stats;
}
