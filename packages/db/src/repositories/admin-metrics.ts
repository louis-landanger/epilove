import { sql } from "drizzle-orm";
import type { Database } from "../client";

type Db = Pick<Database, "execute">;

/**
 * Aggregates for the back-office dashboards (ADM-09). Counts and durations
 * only: no row ever identifies a member. Durations are in hours unless named otherwise.
 */

const DAY_MS = 86_400_000;

function int(value: unknown): number {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? Math.round(number) : 0;
}

function decimal(value: unknown): number | null {
  if (value === null || value === undefined) {
    return null;
  }
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number * 10) / 10 : null;
}

async function rows<T extends Record<string, unknown>>(db: Db, query: ReturnType<typeof sql>): Promise<T[]> {
  return [...(await db.execute<T>(query))] as T[];
}

// --- Members --------------------------------------------------------------------------------

export async function memberMetrics(db: Db, now: Date, days: number) {
  const since = new Date(now.getTime() - days * DAY_MS).toISOString();
  const weekAgo = new Date(now.getTime() - 7 * DAY_MS).toISOString();
  const cohortStart = new Date(now.getTime() - 60 * DAY_MS).toISOString();
  const cohortEnd = new Date(now.getTime() - 30 * DAY_MS).toISOString();

  const [statuses, signups, [activation], [active], [retention], schools, waitlist] = await Promise.all([
    rows<{ status: string; value: number }>(
      db,
      sql`select status, count(*)::int as value from app_user where role = 'user' group by status`,
    ),
    rows<{ day: string; value: number }>(
      db,
      sql`select to_char(created_at at time zone 'Europe/Paris', 'YYYY-MM-DD') as day, count(*)::int as value
          from app_user
          where role = 'user' and created_at >= ${since}
          group by 1 order by 1`,
    ),
    // ≥ 2 approved photos and 3 prompt answers (docs/00, "Activation").
    rows<{ members: number; complete: number }>(
      db,
      sql`select count(*)::int as members,
                 count(*) filter (where photos >= 2 and prompts >= 3)::int as complete
          from (
            select u.id,
                   (select count(*) from photo p where p.user_id = u.id and p.stage = 'ready' and p.status = 'approved') as photos,
                   (select count(*) from prompt_answer a where a.user_id = u.id) as prompts
            from app_user u
            where u.role = 'user' and u.status in ('active', 'restricted', 'paused')
          ) as member`,
    ),
    rows<{ value: number }>(
      db,
      sql`select count(*)::int as value from app_user
          where role = 'user' and status in ('active', 'restricted') and last_active_at >= ${weekAgo}`,
    ),
    // Members who joined 30 to 60 days ago and came back after their first 30 days.
    rows<{ cohort: number; retained: number }>(
      db,
      sql`select count(*)::int as cohort,
                 count(*) filter (where last_active_at >= created_at + interval '30 days')::int as retained
          from app_user
          where role = 'user' and status <> 'onboarding'
            and created_at >= ${cohortStart} and created_at < ${cohortEnd}`,
    ),
    rows<{ slug: string; members: number }>(
      db,
      sql`select s.slug, count(u.id) filter (
                   where u.role = 'user' and u.status in ('active', 'restricted', 'paused')
                 )::int as members
          from school s left join app_user u on u.school_id = s.id
          group by s.slug order by s.slug`,
    ),
    rows<{ slug: string; value: number }>(
      db,
      sql`select s.slug, count(w.id)::int as value
          from school s left join waitlist_entry w on w.school_id = s.id
          group by s.slug order by s.slug`,
    ),
  ]);

  return {
    byStatus: Object.fromEntries(statuses.map((row) => [row.status, int(row.value)])),
    signupsByDay: signups.map((row) => ({ day: row.day, count: int(row.value) })),
    activation: { members: int(activation?.members), complete: int(activation?.complete) },
    activeLast7Days: int(active?.value),
    retention: { cohort: int(retention?.cohort), retained: int(retention?.retained) },
    schools: schools.map((row) => ({
      slug: row.slug,
      members: int(row.members),
      waitlist: int(waitlist.find((entry) => entry.slug === row.slug)?.value),
    })),
  };
}

// --- Moderation -----------------------------------------------------------------------------

export async function moderationMetrics(db: Db, now: Date, days: number) {
  const since = new Date(now.getTime() - days * DAY_MS).toISOString();
  const at = now.toISOString();

  const [reports, photos, [photoReview], [appeals], sanctions] = await Promise.all([
    rows<{
      priority: string;
      open: number;
      oldest_open: number | null;
      handled: number;
      within_24h: number;
      within_target: number;
      median: number | null;
      p90: number | null;
    }>(
      db,
      sql`select priority,
                 count(*) filter (where status in ('open', 'in_review'))::int as open,
                 max(extract(epoch from (${at}::timestamptz - created_at)) / 3600)
                   filter (where status in ('open', 'in_review')) as oldest_open,
                 count(*) filter (where resolved_at >= ${since})::int as handled,
                 count(*) filter (where resolved_at >= ${since} and resolved_at - created_at <= interval '24 hours')::int as within_24h,
                 count(*) filter (
                   where resolved_at >= ${since} and resolved_at - created_at <= case priority
                     when 'p1' then interval '6 hours' when 'p2' then interval '24 hours' else interval '72 hours' end
                 )::int as within_target,
                 percentile_cont(0.5) within group (order by extract(epoch from (resolved_at - created_at)) / 3600)
                   filter (where resolved_at >= ${since}) as median,
                 percentile_cont(0.9) within group (order by extract(epoch from (resolved_at - created_at)) / 3600)
                   filter (where resolved_at >= ${since}) as p90
          from report group by priority`,
    ),
    rows<{ pending: number; oldest: number | null }>(
      db,
      sql`select count(*)::int as pending,
                 max(extract(epoch from (${at}::timestamptz - created_at)) / 3600) as oldest
          from photo where stage = 'ready' and status = 'pending'`,
    ),
    rows<{ reviewed: number; rejected: number; median: number | null }>(
      db,
      sql`select count(*)::int as reviewed,
                 count(*) filter (where status = 'rejected')::int as rejected,
                 percentile_cont(0.5) within group (
                   order by extract(epoch from ((moderation->>'decidedAt')::timestamptz - created_at)) / 3600
                 ) as median
          from photo
          where status in ('approved', 'rejected') and moderation->>'decidedAt' is not null
            and (moderation->>'decidedAt')::timestamptz >= ${since}`,
    ),
    rows<{ pending: number; oldest: number | null; decided: number; overturned: number }>(
      db,
      sql`select count(*) filter (where status = 'pending')::int as pending,
                 max(extract(epoch from (${at}::timestamptz - created_at)) / 3600) filter (where status = 'pending') as oldest,
                 count(*) filter (where decided_at >= ${since})::int as decided,
                 count(*) filter (where decided_at >= ${since} and status = 'overturned')::int as overturned
          from appeal`,
    ),
    rows<{ action: string; value: number }>(
      db,
      sql`select action, count(*)::int as value from moderation_action
          where created_at >= ${since} group by action`,
    ),
  ]);

  const photoQueue = photos[0];
  return {
    reports: reports.map((row) => ({
      priority: row.priority,
      open: int(row.open),
      oldestOpenHours: decimal(row.oldest_open),
      handled: int(row.handled),
      within24h: int(row.within_24h),
      withinTarget: int(row.within_target),
      medianHours: decimal(row.median),
      p90Hours: decimal(row.p90),
    })),
    photos: {
      pending: int(photoQueue?.pending),
      oldestPendingHours: decimal(photoQueue?.oldest),
      reviewed: int(photoReview?.reviewed),
      rejected: int(photoReview?.rejected),
      medianReviewHours: decimal(photoReview?.median),
    },
    appeals: {
      pending: int(appeals?.pending),
      oldestPendingHours: decimal(appeals?.oldest),
      decided: int(appeals?.decided),
      overturned: int(appeals?.overturned),
    },
    sanctions: Object.fromEntries(sanctions.map((row) => [row.action, int(row.value)])),
  };
}

// --- Meeting (tables of the P0 schema, filled by session B) ---------------------------------

export async function meetingMetrics(db: Db, now: Date, days: number) {
  const since = new Date(now.getTime() - days * DAY_MS).toISOString();
  const weekAgo = new Date(now.getTime() - 7 * DAY_MS).toISOString();

  const [[likes], [matches], [reciprocal]] = await Promise.all([
    rows<{ value: number }>(
      db,
      sql`select count(*)::int as value from like_action where created_at >= ${since}`,
    ),
    rows<{ total: number; conversations: number; cross_school: number }>(
      db,
      sql`select count(*)::int as total,
                 count(*) filter (where exists (
                   select 1 from message m where m.match_id = x.id and m.sender_id = x.user_low
                 ) and exists (
                   select 1 from message m where m.match_id = x.id and m.sender_id = x.user_high
                 ))::int as conversations,
                 count(*) filter (where low.school_id <> high.school_id)::int as cross_school
          from match x
          join app_user low on low.id = x.user_low
          join app_user high on high.id = x.user_high
          where x.created_at >= ${since}`,
    ),
    // North Star (docs/00): conversations where each side sent at least three messages this week.
    rows<{ value: number }>(
      db,
      sql`select count(*)::int as value from (
            select x.id
            from match x join message m on m.match_id = x.id
            where m.created_at >= ${weekAgo} and m.deleted_at is null
            group by x.id
            having count(*) filter (where m.sender_id = x.user_low) >= 3
               and count(*) filter (where m.sender_id = x.user_high) >= 3
          ) as conversation`,
    ),
  ]);

  return {
    likes: int(likes?.value),
    matches: int(matches?.total),
    matchesWithConversation: int(matches?.conversations),
    crossSchoolMatches: int(matches?.cross_school),
    reciprocalConversationsThisWeek: int(reciprocal?.value),
  };
}

// --- Technical health -----------------------------------------------------------------------

export async function healthMetrics(db: Db, now: Date) {
  const at = now.toISOString();
  const [[jobs], [photos], [exports], [database]] = await Promise.all([
    rows<{ pending: number; running: number; failed: number; oldest: number | null }>(
      db,
      sql`select count(*) filter (where locked_at is null and attempts < max_attempts)::int as pending,
                 count(*) filter (where locked_at is not null)::int as running,
                 count(*) filter (where attempts >= max_attempts)::int as failed,
                 max(extract(epoch from (${at}::timestamptz - run_at)) / 60)
                   filter (where locked_at is null and attempts < max_attempts and run_at <= ${at}) as oldest
          from graphile_worker.jobs`,
    ),
    rows<{ processing: number; stuck: number; failed: number }>(
      db,
      sql`select count(*) filter (where stage = 'processing')::int as processing,
                 count(*) filter (where stage = 'processing' and updated_at < ${at}::timestamptz - interval '15 minutes')::int as stuck,
                 count(*) filter (where stage = 'failed' and updated_at >= ${at}::timestamptz - interval '1 day')::int as failed
          from photo`,
    ),
    rows<{ pending: number; failed: number }>(
      db,
      sql`select count(*) filter (where status = 'pending')::int as pending,
                 count(*) filter (where status = 'failed')::int as failed
          from data_export`,
    ),
    rows<{ size: number }>(db, sql`select pg_database_size(current_database())::bigint as size`),
  ]);

  return {
    jobs: {
      pending: int(jobs?.pending),
      running: int(jobs?.running),
      failed: int(jobs?.failed),
      oldestWaitingMinutes: decimal(jobs?.oldest),
    },
    photos: {
      processing: int(photos?.processing),
      stuck: int(photos?.stuck),
      failedToday: int(photos?.failed),
    },
    exports: { pending: int(exports?.pending), failed: int(exports?.failed) },
    databaseBytes: int(database?.size),
  };
}
