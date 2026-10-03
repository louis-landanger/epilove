import type { MemberCard, QuotaView } from "@epilove/contracts";
import {
  blindEvening,
  CRUSH_RULES,
  canSee,
  canViewProfile,
  checkDecision,
  compatibility,
  crushHint,
  crushMatchMode,
  DISCOVERY_RULES,
  dailyLikeQuota,
  daysBetween,
  dropDayAt,
  dropWindow,
  isDeckCandidate,
  jaccard,
  LYON_CAMPUS,
  type Mode,
  matchesDeckFilter,
  nextDropAt,
  parseSchoolEmail,
  quotaStatus,
  type RankingCandidate,
  rankDeck,
  recentWeeks,
  sharedModes,
  startOfCampusDay,
  swipeBlocksCandidate,
  violatesDealbreaker,
  weeklyAgreement,
} from "@epilove/core";
import type { Database } from "@epilove/db";
import { weeklyAnswersOf } from "@epilove/db/repositories/campus-community";
import {
  activeMatchBetween,
  decide,
  decisionAbout,
  getDeckFilter,
  impressionsToday,
  lastSignificantChanges,
  likesReceived,
  listSchools,
  loadProfileContent,
  pendingLikesReceived,
  quotaUsage,
  recordImpressions,
  saveDeckFilter,
  swipeHistory,
  undoLastPass,
} from "@epilove/db/repositories/discovery";
import {
  addCrush,
  confirmCrushMatch,
  crushesOf,
  withdrawCrush,
} from "@epilove/db/repositories/discovery-crush";
import { markDropOpened, publishedDropOf } from "@epilove/db/repositories/discovery-drop";
import {
  campusDate,
  interestIdsOf,
  loadDiscoverableMembers,
  loadMembers,
  loadRelations,
  type MemberRow,
  touchLastActive,
} from "@epilove/db/repositories/members";
import { answerSheets } from "@epilove/db/repositories/questionnaire";
import { ORPCError } from "@orpc/server";
import { os, requireViewer } from "../procedures";
import { loadPairAccess, requireMemberRow } from "../rencontre/access";
import { buildCards } from "../rencontre/cards";
import { emailFingerprint } from "../rencontre/email";
import { signedPhotoUrl } from "../rencontre/media";

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;

async function currentQuota(db: Database, viewer: MemberRow, now: Date): Promise<QuotaView> {
  const today = campusDate(now);
  const usage = await quotaUsage(db, viewer.member.id, startOfCampusDay(now, LYON_CAMPUS.timeZone), today);
  return {
    ...quotaStatus(usage, viewer.createdAt, now),
    likesPerDay: dailyLikeQuota(viewer.createdAt, now),
  };
}

/** Modes of a new match: love first when both members share it. */
function matchModeFor(modes: readonly Mode[]): Mode | null {
  return modes.includes("love") ? "love" : modes.includes("friends") ? "friends" : null;
}

const completenessOf = (row: MemberRow) => Math.max(0, Math.min(1, row.completeness / 100));

async function crushListOf(db: Database, userId: string, now: Date) {
  const rows = await crushesOf(db, userId);
  return {
    maxActive: CRUSH_RULES.maxActive,
    crushes: rows.map((row) => ({
      id: row.id,
      hint: row.hint,
      createdAt: row.createdAt.toISOString(),
      expiresAt: row.expiresAt.toISOString(),
      status: row.matchedAt
        ? ("matched" as const)
        : row.expiresAt <= now
          ? ("expired" as const)
          : ("active" as const),
    })),
  };
}

export const discovery = {
  deck: os.discovery.deck.use(requireViewer).handler(async ({ context, input }) => {
    const db = context.database();
    const now = new Date();
    const today = campusDate(now);
    const viewer = await requireMemberRow(db, context.viewer.userId);
    const quota = await currentQuota(db, viewer, now);
    await touchLastActive(db, viewer.member.id, now);
    const evening = blindEvening(now, LYON_CAMPUS.timeZone);
    const blindView = {
      active: evening.active,
      startsAt: evening.startsAt.toISOString(),
      endsAt: evening.endsAt.toISOString(),
    };
    if (input.blind && !evening.active) {
      throw new ORPCError("BAD_REQUEST", { message: "not_blind_evening" });
    }

    if (viewer.member.status === "paused") {
      return { cards: [], quota, empty: "paused" as const, blindEvening: blindView };
    }
    if (!viewer.member.profileComplete || !["active", "restricted"].includes(viewer.member.status)) {
      return { cards: [], quota, empty: "profile_incomplete" as const, blindEvening: blindView };
    }

    const candidates = await loadDiscoverableMembers(db, viewer.member.id);
    const ids = candidates.map((c) => c.member.id);
    const [relations, history, sheets, filter, interests, pending, impressions, changes, weekly] =
      await Promise.all([
        loadRelations(db, viewer.member.id, ids),
        swipeHistory(db, viewer.member.id),
        answerSheets(db, [viewer.member.id, ...ids]),
        getDeckFilter(db, viewer.member.id),
        interestIdsOf(db, [viewer.member.id, ...ids]),
        pendingLikesReceived(db, ids),
        impressionsToday(db, ids, today),
        lastSignificantChanges(db, ids),
        // Questions of the week answered alike (COM-01) feed the ranking a little.
        weeklyAnswersOf(db, [viewer.member.id, ...ids], recentWeeks(now, LYON_CAMPUS.timeZone)),
      ]);
    const viewerSheet = sheets.get(viewer.member.id) ?? new Map();
    const viewerInterests = interests.get(viewer.member.id) ?? new Set<string>();
    // The profiles of the current Drop stay in the Drop (docs/06, section 8).
    const currentDrop = await publishedDropOf(db, viewer.member.id, dropDayAt(now, LYON_CAMPUS.timeZone));
    const excluded = new Set([...input.exclude, ...(currentDrop?.candidates ?? [])]);

    const deckContext = {
      today,
      relations,
      // Second chance (DEC-09): a pass comes back after 45 days if the profile changed since.
      hasRecentlySwiped: (_actor: string, target: string) =>
        swipeBlocksCandidate(history.get(target), changes.get(target) ?? null, now),
      violatesDealbreaker: (_viewer: string, target: string) =>
        violatesDealbreaker(viewerSheet, sheets.get(target) ?? new Map()),
    };

    const eligible: { row: MemberRow; modes: Mode[]; ranking: RankingCandidate }[] = [];
    for (const row of candidates) {
      if (excluded.has(row.member.id)) {
        continue;
      }
      const decision = canSee(viewer.member, row.member, { today, relations });
      if (!decision.visible || !isDeckCandidate(viewer.member, row.member, deckContext)) {
        continue;
      }
      if (!matchesDeckFilter(filter, row, decision.modes, today)) {
        continue;
      }
      eligible.push({
        row,
        modes: [...decision.modes],
        ranking: {
          id: row.member.id,
          schoolSlug: row.member.schoolSlug,
          graduationYear: row.member.graduationYear,
          compatibility: compatibility(viewerSheet, sheets.get(row.member.id) ?? new Map())?.score ?? null,
          interestSimilarity: jaccard(viewerInterests, interests.get(row.member.id) ?? new Set()),
          completeness: completenessOf(row),
          daysSinceActive: Math.max(0, daysBetween(row.member.lastActiveOn, today)),
          accountAgeHours: (now.getTime() - row.createdAt.getTime()) / HOUR_MS,
          pendingLikesReceived: pending.get(row.member.id) ?? 0,
          impressionsToday: impressions.get(row.member.id) ?? 0,
          likedViewer: relations.hasLiked(row.member.id, viewer.member.id),
          weeklyAgreement: weeklyAgreement(weekly.get(viewer.member.id), weekly.get(row.member.id)),
        },
      });
    }

    const ranked = rankDeck(
      {
        id: viewer.member.id,
        schoolSlug: viewer.member.schoolSlug,
        graduationYear: viewer.member.graduationYear,
        crossSchoolBoost: viewer.crossSchoolBoost,
        completeness: completenessOf(viewer),
        daysSinceActive: 0,
      },
      eligible.map((e) => e.ranking),
    ).slice(0, input.limit);
    const byId = new Map(eligible.map((e) => [e.row.member.id, e]));
    const page = ranked.flatMap((r) => {
      const entry = byId.get(r.id);
      return entry ? [{ row: entry.row, modes: entry.modes }] : [];
    });

    const built = await buildCards(db, context.services, viewer, page, input.locale, today, {
      blindDeck: input.blind,
    });
    // The blind deck only shows profiles with something to read (DEC-10).
    const cards = input.blind ? built.filter((c) => c.prompts.length > 0) : built;
    await recordImpressions(
      db,
      viewer.member.id,
      cards.map((c) => c.userId),
      "deck",
      today,
    );
    return {
      cards,
      quota,
      blindEvening: blindView,
      empty: cards.length === 0 ? ("exhausted" as const) : null,
      secondChance: cards.filter((c) => history.get(c.userId)?.kind === "pass").map((c) => c.userId),
    };
  }),

  decide: os.discovery.decide.use(requireViewer).handler(async ({ context, input }) => {
    const db = context.database();
    const now = new Date();
    const pair = await loadPairAccess(db, context.viewer.userId, input.targetId, now);
    if (!pair?.access.visible || pair.access.via === "self") {
      throw new ORPCError("NOT_FOUND");
    }
    const { viewer, target } = pair;
    if (input.kind !== "pass" && viewer.member.status !== "active") {
      // Restricted, paused or onboarding accounts cannot send new likes (docs/07, A4).
      throw new ORPCError("FORBIDDEN", { message: "cannot_like" });
    }
    const modes = sharedModes(viewer.member, target.member);
    const matchMode = matchModeFor(modes);
    if (
      input.kind !== "pass" &&
      (!matchMode || !["discovery", "liked_you", "match"].includes(pair.access.via))
    ) {
      throw new ORPCError("FORBIDDEN", { message: "no_shared_mode" });
    }

    const quota = await currentQuota(db, viewer, now);
    const check = checkDecision(input.kind, input.comment, quota);
    if (!check.ok) {
      throw new ORPCError(
        check.reason === "comment_too_long" || check.reason === "comment_required"
          ? "BAD_REQUEST"
          : "QUOTA_EXCEEDED",
        {
          status: check.reason.endsWith("quota_exceeded") ? 429 : 400,
          message: check.reason,
        },
      );
    }

    const result = await decide(
      db,
      {
        actorId: viewer.member.id,
        targetId: target.member.id,
        kind: input.kind,
        content: input.content,
        comment: input.comment,
        matchMode: matchMode ?? "friends",
        blind: input.blind && blindEvening(now, LYON_CAMPUS.timeZone).active,
        quota: {
          since: startOfCampusDay(now, LYON_CAMPUS.timeZone),
          today: campusDate(now),
          status: (usage) => quotaStatus(usage, viewer.createdAt, now),
        },
      },
      now,
    );
    if (result.outcome === "rejected") {
      if (result.reason === "quota_exceeded") {
        throw new ORPCError("QUOTA_EXCEEDED", { status: 429, message: "quota_exceeded" });
      }
      throw new ORPCError(result.reason === "invalid_content" ? "BAD_REQUEST" : "CONFLICT", {
        message: result.reason,
      });
    }
    return {
      outcome: result.outcome,
      matchId: result.outcome === "matched" ? result.matchId : null,
      quota: await currentQuota(db, viewer, now),
    };
  }),

  undo: os.discovery.undo.use(requireViewer).handler(async ({ context, input }) => {
    const db = context.database();
    const now = new Date();
    const viewer = await requireMemberRow(db, context.viewer.userId);
    const result = await undoLastPass(
      db,
      viewer.member.id,
      campusDate(now),
      DISCOVERY_RULES.undoWindowHours,
      now,
    );
    if (result.restoredId === null) {
      if (result.reason === "quota_exceeded") {
        throw new ORPCError("QUOTA_EXCEEDED", { status: 429, message: "undo_quota_exceeded" });
      }
      return { restored: null, quota: await currentQuota(db, viewer, now) };
    }
    const pair = await loadPairAccess(db, viewer.member.id, result.restoredId, now);
    const restored =
      pair?.access.visible && pair.access.via !== "self"
        ? (
            await buildCards(
              db,
              context.services,
              viewer,
              [{ row: pair.target, modes: sharedModes(viewer.member, pair.target.member) }],
              input.locale,
              pair.today,
            )
          )[0]
        : undefined;
    return { restored: restored ?? null, quota: await currentQuota(db, viewer, now) };
  }),

  likesReceived: os.discovery.likesReceived.use(requireViewer).handler(async ({ context, input }) => {
    const db = context.database();
    const now = new Date();
    const today = campusDate(now);
    const viewer = await requireMemberRow(db, context.viewer.userId);
    const rows = await likesReceived(db, viewer.member.id);
    const members = await loadMembers(
      db,
      rows.map((r) => r.actorId),
    );
    const relations = await loadRelations(
      db,
      viewer.member.id,
      rows.map((r) => r.actorId),
    );
    const visible = rows.flatMap((r) => {
      const row = members.get(r.actorId);
      if (!row) {
        return [];
      }
      const access = canViewProfile(viewer.member, row.member, { today, relations });
      return access.visible && r.kind !== "pass" ? [{ like: { ...r, kind: r.kind }, row }] : [];
    });
    const cards = await buildCards(
      db,
      context.services,
      viewer,
      visible.map((v) => ({ row: v.row, modes: sharedModes(viewer.member, v.row.member) })),
      input.locale,
      today,
    );
    const own = await loadProfileContent(db, [viewer.member.id]);
    const mine = own.get(viewer.member.id) ?? { photos: [], prompts: [], interests: [] };
    return {
      quota: await currentQuota(db, viewer, now),
      likes: visible.flatMap((v, i) => {
        const card = cards[i];
        if (!card) {
          return [];
        }
        const photo =
          v.like.contentType === "photo" ? mine.photos.find((p) => p.id === v.like.contentId) : undefined;
        const prompt =
          v.like.contentType === "prompt" ? mine.prompts.find((p) => p.id === v.like.contentId) : undefined;
        return [
          {
            card,
            kind: v.like.kind === "superlike" ? ("superlike" as const) : ("like" as const),
            comment: v.like.comment,
            liked: photo
              ? { type: "photo" as const, url: signedPhotoUrl(photo.storageKey, "thumb") }
              : prompt
                ? {
                    type: "prompt" as const,
                    question: input.locale === "en" ? prompt.questionEn : prompt.questionFr,
                    answer: prompt.answer,
                  }
                : null,
            at: v.like.at.toISOString(),
          },
        ];
      }),
    };
  }),

  profile: os.discovery.profile.use(requireViewer).handler(async ({ context, input }) => {
    const db = context.database();
    const now = new Date();
    const pair = await loadPairAccess(db, context.viewer.userId, input.userId, now);
    if (!pair?.access.visible) {
      throw new ORPCError("NOT_FOUND");
    }
    const { viewer, target, relations, access } = pair;
    const isSelf = access.via === "self";
    const modes = isSelf ? [...viewer.member.modes] : sharedModes(viewer.member, target.member);
    const [card] = await buildCards(
      db,
      context.services,
      viewer,
      [{ row: target, modes }],
      input.locale,
      pair.today,
    );
    const [decision, activeMatch] = isSelf
      ? [null, null]
      : await Promise.all([
          decisionAbout(db, viewer.member.id, target.member.id),
          activeMatchBetween(db, viewer.member.id, target.member.id),
        ]);
    if (!card) {
      throw new ORPCError("NOT_FOUND");
    }
    if (!isSelf) {
      await recordImpressions(db, viewer.member.id, [target.member.id], "profile", pair.today);
    }
    const alreadyLiked = decision !== null && decision.kind !== "pass";
    return {
      card,
      via: access.via,
      matchId: activeMatch?.id ?? null,
      myDecision: decision?.kind ?? null,
      likedYou: !isSelf && relations.hasLiked(target.member.id, viewer.member.id),
      canLike:
        !isSelf &&
        !activeMatch &&
        !alreadyLiked &&
        viewer.member.status === "active" &&
        matchModeFor(modes) !== null,
    };
  }),

  me: os.discovery.me.use(requireViewer).handler(async ({ context, input }) => {
    const db = context.database();
    const viewer = await requireMemberRow(db, context.viewer.userId);
    const [card] = await buildCards(
      db,
      context.services,
      viewer,
      [{ row: viewer, modes: [...viewer.member.modes] }],
      input.locale,
      campusDate(new Date()),
    );
    if (!card) {
      throw new ORPCError("NOT_FOUND");
    }
    return card;
  }),

  filters: os.discovery.filters.use(requireViewer).handler(async ({ context }) => {
    const db = context.database();
    await requireMemberRow(db, context.viewer.userId);
    const [filter, schools] = await Promise.all([getDeckFilter(db, context.viewer.userId), listSchools(db)]);
    return {
      filter: {
        ...filter,
        schoolSlugs: [...filter.schoolSlugs],
        graduationYears: [...filter.graduationYears],
        intentions: [...filter.intentions] as ("relationship" | "see_what_happens" | "friendship")[],
      },
      schools,
    };
  }),

  saveFilters: os.discovery.saveFilters.use(requireViewer).handler(async ({ context, input }) => {
    const db = context.database();
    await requireMemberRow(db, context.viewer.userId);
    const ageMin = input.ageMin;
    const ageMax = input.ageMax !== null && ageMin !== null && input.ageMax < ageMin ? ageMin : input.ageMax;
    const filter = { ...input, ageMax };
    await saveDeckFilter(db, context.viewer.userId, filter);
    return filter;
  }),

  crushes: os.discovery.crushes.use(requireViewer).handler(async ({ context }) => {
    const db = context.database();
    await requireMemberRow(db, context.viewer.userId);
    return crushListOf(db, context.viewer.userId, new Date());
  }),

  addCrush: os.discovery.addCrush.use(requireViewer).handler(async ({ context, input }) => {
    const db = context.database();
    const now = new Date();
    const viewer = await requireMemberRow(db, context.viewer.userId);
    if (viewer.member.status !== "active" || !viewer.member.profileComplete) {
      throw new ORPCError("FORBIDDEN", { message: "cannot_crush" });
    }
    const parsed = parseSchoolEmail(input.email);
    if (!parsed.ok) {
      throw new ORPCError("BAD_REQUEST", { message: "invalid_email" });
    }
    const target = emailFingerprint(parsed.canonicalEmail);
    if (target === viewer.member.emailHmac) {
      throw new ORPCError("BAD_REQUEST", { message: "self" });
    }
    const result = await addCrush(db, {
      userId: viewer.member.id,
      userEmailHmac: viewer.member.emailHmac,
      targetEmailHmac: target,
      hint: crushHint(parsed.canonicalEmail),
      now,
      expiresAt: new Date(now.getTime() + CRUSH_RULES.durationDays * DAY_MS),
      maxActive: CRUSH_RULES.maxActive,
      addsPer30Days: CRUSH_RULES.addsPer30Days,
    });
    if (!result.ok) {
      throw new ORPCError("FORBIDDEN", { message: result.reason === "limit" ? "crush_limit" : "crush_rate" });
    }
    let matched: { matchId: string; card: MemberCard } | null = null;
    if (result.reverse) {
      // Mutual: the policies decide whether the pair may match; if not, nothing happens and nobody knows.
      const otherId = result.reverse.userId;
      const [rows, relations] = await Promise.all([
        loadMembers(db, [otherId]),
        loadRelations(db, viewer.member.id, [otherId]),
      ]);
      const other = rows.get(otherId);
      const today = campusDate(now);
      const mode = other ? crushMatchMode(viewer.member, other.member, { today, relations }) : null;
      if (other && mode) {
        const matchId = await confirmCrushMatch(db, {
          a: viewer.member.id,
          b: otherId,
          crushIds: [result.crushId, result.reverse.crushId],
          mode,
          now,
        });
        const [card] = await buildCards(
          db,
          context.services,
          viewer,
          [{ row: other, modes: [mode] }],
          input.locale,
          today,
        );
        matched = card ? { matchId, card } : null;
      }
    }
    return { ...(await crushListOf(db, viewer.member.id, now)), matched };
  }),

  removeCrush: os.discovery.removeCrush.use(requireViewer).handler(async ({ context, input }) => {
    const db = context.database();
    const now = new Date();
    await withdrawCrush(db, context.viewer.userId, input.crushId, now);
    return crushListOf(db, context.viewer.userId, now);
  }),

  drop: os.discovery.drop.use(requireViewer).handler(async ({ context, input }) => {
    const db = context.database();
    const now = new Date();
    const today = campusDate(now);
    const timeZone = LYON_CAMPUS.timeZone;
    const viewer = await requireMemberRow(db, context.viewer.userId);
    const day = dropDayAt(now, timeZone);
    const base = { nextAt: nextDropAt(now, timeZone).toISOString(), serverNow: now.toISOString() };
    const current =
      viewer.member.status === "active" ? await publishedDropOf(db, viewer.member.id, day) : null;
    if (!current) {
      return { cards: [], total: 0, expiresAt: null, ...base };
    }
    const ids = current.candidates;
    const [rows, relations, history] = await Promise.all([
      loadMembers(db, ids),
      loadRelations(db, viewer.member.id, ids),
      swipeHistory(db, viewer.member.id),
    ]);
    // Checked again at read time: a block or a pause since 20:30 removes the profile.
    const visible = ids.flatMap((id) => {
      const row = rows.get(id);
      if (!row || history.has(id)) {
        return [];
      }
      const decision = canSee(viewer.member, row.member, { today, relations });
      return decision.visible ? [{ row, modes: [...decision.modes] }] : [];
    });
    const cards = await buildCards(db, context.services, viewer, visible, input.locale, today);
    if (!current.openedAt) {
      await markDropOpened(db, viewer.member.id, day, now);
    }
    await recordImpressions(
      db,
      viewer.member.id,
      visible.map((v) => v.row.member.id),
      "drop",
      today,
    );
    return {
      cards,
      total: ids.length,
      expiresAt: dropWindow(day, timeZone).expiresAt.toISOString(),
      ...base,
    };
  }),
};
