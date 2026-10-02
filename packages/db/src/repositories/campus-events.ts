import type { RsvpStatus } from "@epilove/core";
import { and, asc, eq, inArray, ne, sql } from "drizzle-orm";
import type { Database } from "../client";
import { event, eventRsvp, notification, school } from "../schema";
import { enqueue } from "./outbox";

/**
 * Campus events (IRL-01). Reads are filtered by the viewer's school here;
 * the access policies (matches, blocks) are applied by the API on top.
 */

const DEFAULT_DURATION = sql.raw("interval '180 minutes'");

/** When an event stops being listed (same rule as `eventEndsAt` in @epilove/core). */
const endsAtSql = sql`coalesce(${event.endsAt}, ${event.startsAt} + ${DEFAULT_DURATION})`;

/** Open to the viewer's school (no school listed = whole campus), or organized by the viewer. */
const openTo = (schoolSlug: string, viewerId: string) =>
  sql`(cardinality(${event.schoolIds}) = 0 or exists (
    select 1 from ${school} where ${school.id} = any(${event.schoolIds}) and ${school.slug} = ${schoolSlug}
  ) or ${event.organizerId} = ${viewerId})`;

const columns = (viewerId: string) => ({
  id: event.id,
  organizerId: event.organizerId,
  organizerName: event.organizerName,
  title: event.title,
  description: event.description,
  venue: event.venue,
  spotId: event.spotId,
  startsAt: event.startsAt,
  endsAt: event.endsAt,
  status: event.status,
  schoolSlugs: sql<string[]>`array(
    select ${school.slug} from ${school} where ${school.id} = any(${event.schoolIds}) order by ${school.slug}
  )`,
  going: sql<number>`(select count(*)::int from ${eventRsvp} r where r.event_id = ${event.id} and r.status = 'going')`,
  maybe: sql<number>`(select count(*)::int from ${eventRsvp} r where r.event_id = ${event.id} and r.status = 'maybe')`,
  myStatus: sql<RsvpStatus | null>`(select r.status from ${eventRsvp} r where r.event_id = ${event.id} and r.user_id = ${viewerId})`,
  myShare: sql<
    boolean | null
  >`(select r.share_with_matches from ${eventRsvp} r where r.event_id = ${event.id} and r.user_id = ${viewerId})`,
});

/**
 * Events still to come (or under way) for a member: published ones, plus the
 * cancelled ones they answered, so that they learn about the cancellation.
 */
export async function upcomingEvents(
  db: Database,
  options: { viewerId: string; schoolSlug: string; now: Date; onlyMine?: boolean; limit?: number },
) {
  const { viewerId, schoolSlug, now } = options;
  const answered = sql`exists (select 1 from ${eventRsvp} r where r.event_id = ${event.id} and r.user_id = ${viewerId})`;
  return db
    .select(columns(viewerId))
    .from(event)
    .where(
      and(
        sql`${endsAtSql} > ${now.toISOString()}`,
        openTo(schoolSlug, viewerId),
        options.onlyMine
          ? sql`(${answered} or ${event.organizerId} = ${viewerId})`
          : sql`(${event.status} = 'published' or ${answered})`,
      ),
    )
    .orderBy(asc(event.startsAt))
    .limit(options.limit ?? 50);
}

/** One event as seen by a member, past events included; null when it is not open to them. */
export async function eventForViewer(
  db: Database,
  eventId: string,
  viewer: { id: string; schoolSlug: string },
) {
  const [row] = await db
    .select(columns(viewer.id))
    .from(event)
    .where(and(eq(event.id, eventId), openTo(viewer.schoolSlug, viewer.id)));
  return row ?? null;
}

export async function eventById(db: Database, eventId: string) {
  const [row] = await db.select().from(event).where(eq(event.id, eventId));
  return row ?? null;
}

/** "J'y vais" / "Peut-être": one answer per member and event, replaced on change (idempotent). */
export async function saveRsvp(
  db: Database,
  input: { eventId: string; userId: string; status: RsvpStatus; shareWithMatches: boolean },
) {
  await db
    .insert(eventRsvp)
    .values(input)
    .onConflictDoUpdate({
      target: [eventRsvp.eventId, eventRsvp.userId],
      set: { status: input.status, shareWithMatches: input.shareWithMatches, updatedAt: new Date() },
    });
}

export async function removeRsvp(db: Database, eventId: string, userId: string) {
  await db.delete(eventRsvp).where(and(eq(eventRsvp.eventId, eventId), eq(eventRsvp.userId, userId)));
}

/** Members who answered and chose to share it with their matches (the viewer excluded). */
export async function sharingAttendees(db: Database, eventId: string, excludeId: string) {
  return db
    .select({ userId: eventRsvp.userId, status: eventRsvp.status })
    .from(eventRsvp)
    .where(
      and(
        eq(eventRsvp.eventId, eventId),
        eq(eventRsvp.shareWithMatches, true),
        ne(eventRsvp.userId, excludeId),
      ),
    );
}

export async function schoolIdsBySlugs(db: Database, slugs: readonly string[]): Promise<string[]> {
  if (slugs.length === 0) {
    return [];
  }
  const rows = await db
    .select({ id: school.id })
    .from(school)
    .where(inArray(school.slug, [...slugs]));
  return rows.map((r) => r.id);
}

export interface EventValues {
  readonly organizerName: string;
  readonly title: string;
  readonly description: string;
  readonly venue: string;
  readonly spotId: string | null;
  readonly startsAt: Date;
  readonly endsAt: Date | null;
  readonly schoolIds: readonly string[];
}

export async function createEvent(db: Database, organizerId: string, values: EventValues): Promise<string> {
  const [row] = await db
    .insert(event)
    .values({ ...values, schoolIds: [...values.schoolIds], organizerId })
    .returning({ id: event.id });
  if (!row) {
    throw new Error("Event creation failed.");
  }
  return row.id;
}

export async function updateEvent(db: Database, eventId: string, values: EventValues) {
  await db
    .update(event)
    .set({ ...values, schoolIds: [...values.schoolIds] })
    .where(and(eq(event.id, eventId), eq(event.status, "published")));
}

/**
 * Cancels an event and tells the members who answered (in the notification
 * centre and by push). Returns false when it was already cancelled.
 */
export async function cancelEvent(db: Database, eventId: string): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [cancelled] = await tx
      .update(event)
      .set({ status: "cancelled" })
      .where(and(eq(event.id, eventId), eq(event.status, "published")))
      .returning({ id: event.id });
    if (!cancelled) {
      return false;
    }
    const attendees = await tx
      .select({ userId: eventRsvp.userId })
      .from(eventRsvp)
      .where(eq(eventRsvp.eventId, eventId));
    if (attendees.length > 0) {
      await tx
        .insert(notification)
        .values(attendees.map((a) => ({ userId: a.userId, type: "event_cancelled", payload: { eventId } })));
      await enqueue(
        tx,
        attendees.map((a) => ({ userId: a.userId, event: { type: "notification.created" as const } })),
      );
    }
    return true;
  });
}

/** Events of the coming week, for the weekly digest (NOT-05). */
export async function eventsBetween(db: Database, from: Date, to: Date) {
  return db
    .select({ id: event.id, title: event.title, startsAt: event.startsAt, schoolIds: event.schoolIds })
    .from(event)
    .where(
      and(
        eq(event.status, "published"),
        sql`${event.startsAt} >= ${from.toISOString()} and ${event.startsAt} < ${to.toISOString()}`,
      ),
    )
    .orderBy(asc(event.startsAt));
}
