import type { PactMatchView } from "@atomes/contracts";
import {
  canViewPactResult,
  canViewProfile,
  MODES,
  PACT_RULES,
  pactPhase,
  revealWindowMs,
} from "@atomes/core";
import { campusDate, loadMembers, loadRelations } from "@atomes/db/repositories/members";
import {
  currentSeason,
  joinSeason,
  leaveSeason,
  participantCount,
  participationOf,
  resultsFor,
} from "@atomes/db/repositories/pact";
import { answersOf } from "@atomes/db/repositories/questionnaire";
import { centrifugoConfigFromEnv, PACT_CHANNEL } from "@atomes/realtime";
import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { os, requireViewer } from "../procedures";
import { requireMemberRow } from "../rencontre/access";
import { buildCards } from "../rencontre/cards";
import { realtimePublisher } from "../rencontre/realtime";

/** The Pact (PAC-02, PAC-03): participation, countdown, live count and results. */

const storedExplanation = z.object({
  sections: z.array(z.object({ section: z.string(), score: z.number().nullable() })).default([]),
});

/** Statuses that can take part (the same as discovery). */
const PARTICIPATING_STATUSES = new Set(["active", "restricted"]);

async function requireSeason(db: Parameters<typeof currentSeason>[0]) {
  const season = await currentSeason(db);
  if (!season) {
    throw new ORPCError("NOT_FOUND", { message: "no_season" });
  }
  return season;
}

/**
 * The live counter is read by every open reveal page every few seconds: one
 * presence request to Centrifugo per API process and per few seconds is enough.
 */
const LIVE_COUNT_TTL_MS = 5000;
let liveCountCache: { value: number | null; at: number } | null = null;

export function resetLiveCountCache() {
  liveCountCache = null;
}

/** Results this deployment serves per second during a reveal (infra/load measures it). */
function revealResultsPerSecond(env: Record<string, string | undefined> = process.env): number {
  const value = Number(env.PACT_REVEAL_RESULTS_PER_SECOND);
  return Number.isFinite(value) && value > 0 ? value : PACT_RULES.revealResultsPerSecond;
}

export const pact = {
  current: os.pact.current.use(requireViewer).handler(async ({ context }) => {
    const db = context.database();
    const now = new Date();
    const viewer = await requireMemberRow(db, context.viewer.userId);
    const season = await currentSeason(db);
    const [participation, participants, answers] = await Promise.all([
      season ? participationOf(db, season.id, context.viewer.userId) : null,
      season ? participantCount(db, season.id) : 0,
      answersOf(db, context.viewer.userId),
    ]);
    return {
      season: season
        ? {
            id: season.id,
            name: season.name,
            opensAt: season.opensAt.toISOString(),
            closesAt: season.closesAt.toISOString(),
            revealAt: season.revealAt.toISOString(),
            phase: pactPhase(season, now),
          }
        : null,
      serverNow: now.toISOString(),
      participation: participation ? { modes: participation.modes } : null,
      participants,
      revealWindowMs: revealWindowMs(participants, revealResultsPerSecond()),
      availableModes: [...viewer.member.modes],
      questionnaire: { answered: answers.length, required: PACT_RULES.minAnswers },
    };
  }),

  join: os.pact.join.use(requireViewer).handler(async ({ context, input }) => {
    const db = context.database();
    const viewer = await requireMemberRow(db, context.viewer.userId);
    if (!PARTICIPATING_STATUSES.has(viewer.member.status) || !viewer.member.profileComplete) {
      throw new ORPCError("FORBIDDEN", { message: "profile_required" });
    }
    const modes = [...new Set(input.modes)];
    if (modes.some((mode) => !viewer.member.modes.includes(mode))) {
      throw new ORPCError("BAD_REQUEST", { message: "mode_unavailable" });
    }
    const answers = await answersOf(db, context.viewer.userId);
    if (answers.length < PACT_RULES.minAnswers) {
      throw new ORPCError("FORBIDDEN", { message: "questionnaire_incomplete" });
    }
    const season = await requireSeason(db);
    const outcome = await joinSeason(db, {
      seasonId: season.id,
      userId: context.viewer.userId,
      modes,
      now: new Date(),
    });
    if (outcome === "closed") {
      throw new ORPCError("CONFLICT", { message: "pact_closed" });
    }
    return { modes };
  }),

  leave: os.pact.leave.use(requireViewer).handler(async ({ context }) => {
    const db = context.database();
    const season = await requireSeason(db);
    const outcome = await leaveSeason(db, {
      seasonId: season.id,
      userId: context.viewer.userId,
      now: new Date(),
    });
    if (outcome === "closed") {
      throw new ORPCError("CONFLICT", { message: "pact_closed" });
    }
    return { left: true };
  }),

  result: os.pact.result.use(requireViewer).handler(async ({ context, input }) => {
    // Every member asks within seconds of the reveal (docs/11): few round trips, no reload of the viewer.
    const db = context.database();
    const now = new Date();
    const userId = context.viewer.userId;
    const [viewer, season] = await Promise.all([requireMemberRow(db, userId), requireSeason(db)]);
    const [participation, results] = await Promise.all([
      participationOf(db, season.id, userId),
      resultsFor(db, season.id, userId),
    ]);
    if (!canViewPactResult(season, now, participation !== null)) {
      throw new ORPCError("FORBIDDEN", { message: "not_revealed" });
    }
    const today = campusDate(now);
    const otherIds = results.map((result) => result.otherId);
    const [others, relations] = await Promise.all([
      loadMembers(db, otherIds),
      loadRelations(db, userId, otherIds),
    ]);
    // The match created at the reveal makes the profile visible; a block since then hides it again.
    const visible = results.flatMap((result) => {
      const target = others.get(result.otherId);
      return target && canViewProfile(viewer.member, target.member, { today, relations }).visible
        ? [{ result, target }]
        : [];
    });
    const cards = new Map(
      (
        await buildCards(
          db,
          context.services,
          viewer,
          visible.map(({ result, target }) => ({ row: target, modes: [result.mode] })),
          input.locale,
          today,
        )
      ).map((card) => [card.userId, card]),
    );
    const matches: PactMatchView[] = [];
    for (const { result } of visible) {
      const card = cards.get(result.otherId);
      if (!card) {
        continue;
      }
      const explanation = storedExplanation.safeParse(result.explanation ?? {});
      matches.push({
        mode: result.mode,
        score: result.score,
        card,
        sections: explanation.success ? explanation.data.sections : [],
        compatibility: card.compatibility ?? {
          score: result.score,
          commonQuestions: 0,
          agreements: [],
          quirk: null,
        },
        matchId: result.matchId,
      });
    }
    // Love first, then friends (the order of the modes everywhere in the app).
    matches.sort((x, y) => MODES.indexOf(x.mode) - MODES.indexOf(y.mode));
    return { seasonId: season.id, matches };
  }),

  liveCount: os.pact.liveCount.use(requireViewer).handler(async () => {
    if (!centrifugoConfigFromEnv()) {
      return { count: null };
    }
    const now = Date.now();
    if (liveCountCache && now - liveCountCache.at < LIVE_COUNT_TTL_MS) {
      return { count: liveCountCache.value };
    }
    let value: number | null;
    try {
      value = await realtimePublisher().presenceCount(PACT_CHANNEL);
    } catch {
      value = null;
    }
    liveCountCache = { value, at: now };
    return { count: value };
  }),
};
