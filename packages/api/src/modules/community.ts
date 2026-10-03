import {
  ANONYMITY_THRESHOLD,
  academicYear,
  anonymousResults,
  canUseApp,
  crossSchoolIndex,
  type Distribution,
  isoWeek,
  LYON_CAMPUS,
  questionForWeek,
  weekEndsAt,
} from "@epilove/core";
import type { Database } from "@epilove/db";
import {
  activeWeeklyBank,
  latestRevealedSeason,
  matchCountsBySchoolPair,
  saveWeeklyAnswer,
  seasonAnswerCounts,
  seasonFigures,
  weeklyAnswerOf,
  weeklyCounts,
  wrappedFigures,
} from "@epilove/db/repositories/campus-community";
import { campusDate, type MemberRow } from "@epilove/db/repositories/members";
import { ORPCError } from "@orpc/server";
import { os, requireViewer } from "../procedures";
import { requireMemberRow } from "../rencontre/access";

const TIME_ZONE = LYON_CAMPUS.timeZone;
/** Questionnaire sections light enough for public statistics (not values or life plans). */
const PACT_FACT_SECTIONS = ["campus", "nerd", "lifestyle"] as const;
const PACT_FACTS = 5;

async function requireParticipant(db: Database, viewerId: string): Promise<MemberRow> {
  const viewer = await requireMemberRow(db, viewerId);
  if (!canUseApp(viewer.member, campusDate(new Date()))) {
    throw new ORPCError("FORBIDDEN", { message: "not_eligible" });
  }
  return viewer;
}

async function weeklyFor(db: Database, viewerId: string, locale: "fr" | "en", now: Date) {
  const week = isoWeek(now, TIME_ZONE);
  const current = questionForWeek(await activeWeeklyBank(db), week);
  const mine = await weeklyAnswerOf(db, week, viewerId);
  const myAnswer = current && mine?.questionId === current.id ? mine.option : null;
  let results = null;
  if (current && myAnswer) {
    const counts = await weeklyCounts(db, week, current.id);
    const aggregates = anonymousResults(
      counts,
      current.options.map((o) => o.value),
    );
    const plain = (d: Distribution) => ({ total: d.total, shares: d.shares.map((share) => ({ ...share })) });
    results = {
      overall: aggregates.overall ? plain(aggregates.overall) : null,
      bySchool: aggregates.groups.map((g) => ({ schoolSlug: g.group, ...plain(g) })),
    };
  }
  return {
    week,
    endsAt: weekEndsAt(now, TIME_ZONE).toISOString(),
    question: current
      ? {
          id: current.id,
          text: locale === "en" ? current.textEn : current.textFr,
          options: current.options.map((o) => ({
            value: o.value,
            label: locale === "en" ? o.labelEn : o.labelFr,
          })),
        }
      : null,
    myAnswer,
    results,
  };
}

/** Campus community (COM-01, COM-02, PAC-04): only aggregates of ten people or more. */
export const community = {
  weekly: os.community.weekly.use(requireViewer).handler(async ({ context, input }) => {
    const db = context.database();
    const viewer = await requireParticipant(db, context.viewer.userId);
    return weeklyFor(db, viewer.member.id, input.locale, new Date());
  }),

  answerWeekly: os.community.answerWeekly.use(requireViewer).handler(async ({ context, input }) => {
    const db = context.database();
    const now = new Date();
    const viewer = await requireParticipant(db, context.viewer.userId);
    const week = isoWeek(now, TIME_ZONE);
    const current = questionForWeek(await activeWeeklyBank(db), week);
    if (!current || current.id !== input.questionId) {
      throw new ORPCError("BAD_REQUEST", { message: "closed" });
    }
    if (!current.options.some((o) => o.value === input.option)) {
      throw new ORPCError("BAD_REQUEST", { message: "invalid_option" });
    }
    await saveWeeklyAnswer(db, {
      week,
      userId: viewer.member.id,
      questionId: current.id,
      option: input.option,
    });
    return weeklyFor(db, viewer.member.id, input.locale, now);
  }),

  crossSchool: os.community.crossSchool.use(requireViewer).handler(async ({ context }) => {
    const db = context.database();
    await requireParticipant(db, context.viewer.userId);
    const since = new Date(Date.now() - 7 * 86_400_000);
    return { since: since.toISOString(), pairs: crossSchoolIndex(await matchCountsBySchoolPair(db, since)) };
  }),

  pactStats: os.community.pactStats.use(requireViewer).handler(async ({ context, input }) => {
    const db = context.database();
    await requireParticipant(db, context.viewer.userId);
    const season = await latestRevealedSeason(db);
    if (!season) {
      return { season: null, participants: null, matches: null, crossSchoolPercent: null, facts: [] };
    }
    const figures = await seasonFigures(db, season.id);
    const enough = figures.participants >= ANONYMITY_THRESHOLD;
    const byQuestion = new Map<
      string,
      { text: string; total: number; top: { label: string; count: number } }
    >();
    for (const row of await seasonAnswerCounts(db, season.id, PACT_FACT_SECTIONS)) {
      const option = row.options.find((o) => o.value === row.option);
      if (!option) {
        continue;
      }
      const label = input.locale === "en" ? option.labelEn : option.labelFr;
      const entry = byQuestion.get(row.slug) ?? {
        text: input.locale === "en" ? row.textEn : row.textFr,
        total: 0,
        top: { label, count: 0 },
      };
      entry.total += row.count;
      if (row.count > entry.top.count) {
        entry.top = { label, count: row.count };
      }
      byQuestion.set(row.slug, entry);
    }
    const facts = [...byQuestion.entries()]
      .filter(([, q]) => q.total >= ANONYMITY_THRESHOLD && q.top.count >= ANONYMITY_THRESHOLD)
      .map(([slug, q]) => ({
        slug,
        question: q.text,
        option: q.top.label,
        percent: Math.round((q.top.count / q.total) * 100),
      }))
      .sort((a, b) => b.percent - a.percent || a.slug.localeCompare(b.slug))
      .slice(0, PACT_FACTS)
      .map(({ slug: _slug, ...fact }) => fact);
    return {
      season: { name: season.name },
      participants: enough ? figures.participants : null,
      matches: enough ? figures.matches : null,
      crossSchoolPercent:
        enough && figures.matches >= ANONYMITY_THRESHOLD
          ? Math.round((figures.crossSchool / figures.matches) * 100)
          : null,
      facts: enough ? facts : [],
    };
  }),

  wrapped: os.community.wrapped.use(requireViewer).handler(async ({ context }) => {
    const db = context.database();
    const viewer = await requireParticipant(db, context.viewer.userId);
    const year = academicYear(new Date(), TIME_ZONE);
    const figures = await wrappedFigures(db, viewer.member.id, year.since, TIME_ZONE);
    return { label: year.label, since: year.since.toISOString(), ...figures };
  }),
};
