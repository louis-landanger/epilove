import type { PactMatchView } from "@epilove/contracts";
import { canViewPactResult, MODES, PACT_RULES, pactPhase } from "@epilove/core";
import { campusDate } from "@epilove/db/repositories/members";
import {
  currentSeason,
  joinSeason,
  leaveSeason,
  participantCount,
  participationOf,
  resultsFor,
} from "@epilove/db/repositories/pact";
import { answersOf } from "@epilove/db/repositories/questionnaire";
import { centrifugoConfigFromEnv, PACT_CHANNEL } from "@epilove/realtime";
import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { os, requireViewer } from "../procedures";
import { loadPairAccess, requireMemberRow } from "../rencontre/access";
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
    const db = context.database();
    const now = new Date();
    const viewer = await requireMemberRow(db, context.viewer.userId);
    const season = await requireSeason(db);
    const participation = await participationOf(db, season.id, context.viewer.userId);
    if (!canViewPactResult(season, now, participation !== null)) {
      throw new ORPCError("FORBIDDEN", { message: "not_revealed" });
    }
    const today = campusDate(now);
    const matches: PactMatchView[] = [];
    for (const result of await resultsFor(db, season.id, context.viewer.userId)) {
      // The match created at the reveal makes the profile visible; a block since then hides it again.
      const pair = await loadPairAccess(db, context.viewer.userId, result.otherId, now);
      if (!pair?.access.visible) {
        continue;
      }
      const [card] = await buildCards(
        db,
        context.services,
        viewer,
        [{ row: pair.target, modes: [result.mode] }],
        input.locale,
        today,
      );
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
