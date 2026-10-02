import { and, asc, count, eq, gte, inArray, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { Database } from "../client";
import {
  appUser,
  availability,
  event,
  eventRsvp,
  likeAction,
  match,
  memberBadge,
  message,
  pactParticipant,
  pactResult,
  pactSeason,
  question,
  questionAnswer,
  reaction,
  school,
  weeklyAnswer,
  weeklyQuestion,
} from "../schema";

/**
 * Campus community figures (COM-01, COM-02, PAC-04). These functions return
 * raw counts by group; the anonymity rules of @epilove/core decide what is
 * shown. Banned, suspended and deleted accounts are never counted.
 */
const COUNTED = sql`${appUser.status} in ('active', 'restricted', 'paused')`;

export async function activeWeeklyBank(db: Database) {
  return db
    .select()
    .from(weeklyQuestion)
    .where(eq(weeklyQuestion.active, true))
    .orderBy(asc(weeklyQuestion.position));
}

export async function weeklyAnswerOf(db: Database, week: string, userId: string) {
  const [row] = await db
    .select({ questionId: weeklyAnswer.questionId, option: weeklyAnswer.option })
    .from(weeklyAnswer)
    .where(and(eq(weeklyAnswer.week, week), eq(weeklyAnswer.userId, userId)));
  return row ?? null;
}

/** Answers until the end of the week; changing one's mind replaces the answer. */
export async function saveWeeklyAnswer(
  db: Database,
  input: { week: string; userId: string; questionId: string; option: string },
) {
  await db
    .insert(weeklyAnswer)
    .values(input)
    .onConflictDoUpdate({
      target: [weeklyAnswer.week, weeklyAnswer.userId],
      set: { questionId: input.questionId, option: input.option, updatedAt: new Date() },
    });
}

/** Answers of the week by school and option. */
export async function weeklyCounts(db: Database, week: string, questionId: string) {
  return db
    .select({ group: school.slug, option: weeklyAnswer.option, count: count() })
    .from(weeklyAnswer)
    .innerJoin(appUser, eq(appUser.id, weeklyAnswer.userId))
    .innerJoin(school, eq(school.id, appUser.schoolId))
    .where(and(eq(weeklyAnswer.week, week), eq(weeklyAnswer.questionId, questionId), COUNTED))
    .groupBy(school.slug, weeklyAnswer.option);
}

/** Weekly answers of several members over some weeks (deck ranking). */
export async function weeklyAnswersOf(
  db: Database,
  userIds: readonly string[],
  weeks: readonly string[],
): Promise<Map<string, Map<string, string>>> {
  const result = new Map<string, Map<string, string>>();
  if (userIds.length === 0 || weeks.length === 0) {
    return result;
  }
  const rows = await db
    .select({ userId: weeklyAnswer.userId, week: weeklyAnswer.week, option: weeklyAnswer.option })
    .from(weeklyAnswer)
    .where(and(inArray(weeklyAnswer.userId, [...userIds]), inArray(weeklyAnswer.week, [...weeks])));
  for (const row of rows) {
    const map = result.get(row.userId) ?? new Map<string, string>();
    map.set(row.week, row.option);
    result.set(row.userId, map);
  }
  return result;
}

/** New matches since `since` by pair of schools (COM-02), both modes together. */
export async function matchCountsBySchoolPair(db: Database, since: Date) {
  const userA = alias(appUser, "user_a");
  const userB = alias(appUser, "user_b");
  const schoolA = alias(school, "school_a");
  const schoolB = alias(school, "school_b");
  return db
    .select({ a: schoolA.slug, b: schoolB.slug, count: count() })
    .from(match)
    .innerJoin(userA, eq(userA.id, match.userLow))
    .innerJoin(userB, eq(userB.id, match.userHigh))
    .innerJoin(schoolA, eq(schoolA.id, userA.schoolId))
    .innerJoin(schoolB, eq(schoolB.id, userB.schoolId))
    .where(gte(match.createdAt, since))
    .groupBy(schoolA.slug, schoolB.slug);
}

/** The latest revealed Pact season, if any. */
export async function latestRevealedSeason(db: Database) {
  const [row] = await db
    .select({ id: pactSeason.id, name: pactSeason.name, revealedAt: pactSeason.revealedAt })
    .from(pactSeason)
    .where(eq(pactSeason.status, "revealed"))
    .orderBy(sql`${pactSeason.revealAt} desc`)
    .limit(1);
  return row ?? null;
}

/** Participants, matches and cross-school matches of a season (PAC-04). */
export async function seasonFigures(db: Database, seasonId: string) {
  const [participants] = await db
    .select({ n: sql<number>`count(distinct ${pactParticipant.userId})::int` })
    .from(pactParticipant)
    .where(eq(pactParticipant.seasonId, seasonId));
  const userA = alias(appUser, "user_a");
  const userB = alias(appUser, "user_b");
  const [results] = await db
    .select({
      matches: count(),
      crossSchool: sql<number>`count(*) filter (where ${userA.schoolId} <> ${userB.schoolId})::int`,
    })
    .from(pactResult)
    .innerJoin(userA, eq(userA.id, pactResult.userLow))
    .innerJoin(userB, eq(userB.id, pactResult.userHigh))
    .where(eq(pactResult.seasonId, seasonId));
  return {
    participants: participants?.n ?? 0,
    matches: results?.matches ?? 0,
    crossSchool: results?.crossSchool ?? 0,
  };
}

/** Answers of a season's participants to some questions, by option (PAC-04). */
export async function seasonAnswerCounts(db: Database, seasonId: string, sections: readonly string[]) {
  return db
    .select({
      questionId: question.id,
      slug: question.slug,
      textFr: question.textFr,
      textEn: question.textEn,
      options: question.options,
      option: questionAnswer.answer,
      count: sql<number>`count(distinct ${questionAnswer.userId})::int`,
    })
    .from(questionAnswer)
    .innerJoin(question, eq(question.id, questionAnswer.questionId))
    .innerJoin(
      pactParticipant,
      and(eq(pactParticipant.userId, questionAnswer.userId), eq(pactParticipant.seasonId, seasonId)),
    )
    .innerJoin(appUser, eq(appUser.id, questionAnswer.userId))
    .where(and(inArray(question.section, [...sections]), eq(question.active, true), COUNTED))
    .groupBy(
      question.id,
      question.slug,
      question.textFr,
      question.textEn,
      question.options,
      questionAnswer.answer,
    );
}

/** Badges granted to members (COM-04), by member. */
export async function grantedBadgesOf(
  db: Database,
  userIds: readonly string[],
): Promise<Map<string, Set<string>>> {
  const result = new Map<string, Set<string>>();
  if (userIds.length === 0) {
    return result;
  }
  const rows = await db
    .select({ userId: memberBadge.userId, badge: memberBadge.badge })
    .from(memberBadge)
    .where(inArray(memberBadge.userId, [...userIds]));
  for (const row of rows) {
    result.set(row.userId, (result.get(row.userId) ?? new Set()).add(row.badge));
  }
  return result;
}

export interface AvailabilityRow {
  readonly activity: (typeof availability.$inferSelect)["activity"];
  readonly area: (typeof availability.$inferSelect)["area"];
  readonly until: Date;
}

/** "Dispo" statuses (IRL-05) of some members; the caller checks expiry and visibility. */
export async function availabilityOf(
  db: Database,
  userIds: readonly string[],
): Promise<Map<string, AvailabilityRow>> {
  if (userIds.length === 0) {
    return new Map();
  }
  const rows = await db
    .select({
      userId: availability.userId,
      activity: availability.activity,
      area: availability.area,
      until: availability.until,
    })
    .from(availability)
    .where(inArray(availability.userId, [...userIds]));
  return new Map(rows.map(({ userId, ...row }) => [userId, row]));
}

/** Sets or clears (null) one's "Dispo" status. */
export async function setAvailability(db: Database, userId: string, value: AvailabilityRow | null) {
  if (!value) {
    await db.delete(availability).where(eq(availability.userId, userId));
    return;
  }
  await db
    .insert(availability)
    .values({ userId, ...value })
    .onConflictDoUpdate({ target: availability.userId, set: { ...value, updatedAt: new Date() } });
}

/**
 * Wrapped (COM-03): the member's own figures since `since`. Counts only:
 * never who, never what was said.
 */
export async function wrappedFigures(db: Database, userId: string, since: Date, timeZone: string) {
  const from = since.toISOString();
  const [row] = await db.execute<{
    matches: number;
    messages: number;
    conversations: number;
    likes: number;
    events: number;
    pacts: number;
    favorite_reaction: string | null;
    peak_hour: number | null;
  }>(sql`
    select
      (select count(*)::int from ${match} m
        where (m.user_low = ${userId} or m.user_high = ${userId}) and m.created_at >= ${from}) as matches,
      (select count(*)::int from ${message} msg
        where msg.sender_id = ${userId} and msg.created_at >= ${from} and msg.deleted_at is null) as messages,
      (select count(distinct msg.match_id)::int from ${message} msg
        where msg.sender_id = ${userId} and msg.created_at >= ${from}) as conversations,
      (select count(*)::int from ${likeAction} l
        where l.actor_id = ${userId} and l.kind <> 'pass' and l.created_at >= ${from}) as likes,
      (select count(*)::int from ${eventRsvp} r join ${event} e on e.id = r.event_id
        where r.user_id = ${userId} and r.status = 'going' and e.starts_at >= ${from} and e.starts_at <= now()
          and e.status = 'published') as events,
      (select count(*)::int from ${pactParticipant} p join ${pactSeason} s on s.id = p.season_id
        where p.user_id = ${userId} and s.reveal_at >= ${from}) as pacts,
      (select r.emoji from ${reaction} r
        where r.user_id = ${userId} and r.created_at >= ${from}
        group by r.emoji order by count(*) desc, r.emoji limit 1) as favorite_reaction,
      (select extract(hour from msg.created_at at time zone ${timeZone})::int from ${message} msg
        where msg.sender_id = ${userId} and msg.created_at >= ${from}
        group by 1 order by count(*) desc, 1 limit 1) as peak_hour
  `);
  return {
    matches: row?.matches ?? 0,
    messages: row?.messages ?? 0,
    conversations: row?.conversations ?? 0,
    likes: row?.likes ?? 0,
    events: row?.events ?? 0,
    pacts: row?.pacts ?? 0,
    favoriteReaction: row?.favorite_reaction ?? null,
    peakHour: row?.peak_hour ?? null,
  };
}
