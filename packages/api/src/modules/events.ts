import {
  attendanceVisible,
  canOrganize,
  canUseApp,
  canViewProfile,
  checkEventDraft,
  eventEndsAt,
} from "@epilove/core";
import type { Database } from "@epilove/db";
import {
  cancelEvent,
  createEvent,
  type EventValues,
  eventById,
  eventForViewer,
  removeRsvp,
  saveRsvp,
  schoolIdsBySlugs,
  sharingAttendees,
  upcomingEvents,
  updateEvent,
} from "@epilove/db/repositories/campus-events";
import { spotById } from "@epilove/db/repositories/campus-life";
import { loadProfileContent } from "@epilove/db/repositories/discovery";
import { activeMatchesOf } from "@epilove/db/repositories/matches";
import {
  campusDate,
  loadMembers,
  loadRelations,
  type MemberRow,
  roleOf,
} from "@epilove/db/repositories/members";
import { ORPCError } from "@orpc/server";
import { os, requireViewer } from "../procedures";
import { requireMemberRow } from "../rencontre/access";
import { hiddenPhotos } from "../rencontre/blind";
import { signedPhotoUrl } from "../rencontre/media";

type Row = NonNullable<Awaited<ReturnType<typeof eventForViewer>>>;

function toSummary(row: Row, viewerId: string) {
  return {
    id: row.id,
    title: row.title,
    organizerName: row.organizerName,
    venue: row.venue,
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt?.toISOString() ?? null,
    status: row.status,
    schoolSlugs: row.schoolSlugs,
    going: row.going,
    maybe: row.maybe,
    mine: row.myStatus ? { status: row.myStatus, shareWithMatches: row.myShare === true } : null,
    organizing: row.organizerId === viewerId,
  };
}

/** The viewer as a member allowed to use the campus features. */
async function requireAttendee(db: Database, viewerId: string): Promise<MemberRow> {
  const viewer = await requireMemberRow(db, viewerId);
  if (!canUseApp(viewer.member, campusDate(new Date()))) {
    throw new ORPCError("FORBIDDEN", { message: "not_eligible" });
  }
  return viewer;
}

async function requireEvent(db: Database, eventId: string, viewer: MemberRow) {
  const row = await eventForViewer(db, eventId, {
    id: viewer.member.id,
    schoolSlug: viewer.member.schoolSlug,
  });
  if (!row) {
    throw new ORPCError("NOT_FOUND");
  }
  return row;
}

/** Validates an organizer's input and turns it into stored values (the venue of a Spot is its name). */
async function eventValues(
  db: Database,
  input: {
    title: string;
    organizerName: string;
    description: string;
    venue: string | null;
    spotId: string | null;
    startsAt: string;
    endsAt: string | null;
    schoolSlugs: readonly string[];
  },
  now: Date,
): Promise<EventValues> {
  const startsAt = new Date(input.startsAt);
  const endsAt = input.endsAt ? new Date(input.endsAt) : null;
  const check = checkEventDraft({ ...input, startsAt, endsAt }, now);
  if (!check.ok) {
    throw new ORPCError("BAD_REQUEST", { message: check.reason });
  }
  let venue = input.venue?.trim() ?? "";
  if (input.spotId) {
    const spot = await spotById(db, input.spotId);
    if (!spot?.active) {
      throw new ORPCError("BAD_REQUEST", { message: "unknown_spot" });
    }
    venue ||= spot.nameFr;
  }
  return {
    title: input.title.trim(),
    organizerName: input.organizerName.trim(),
    description: input.description.trim(),
    venue,
    spotId: input.spotId,
    startsAt,
    endsAt,
    schoolIds: await schoolIdsBySlugs(db, input.schoolSlugs),
  };
}

/** The viewer's role as stored now (a withdrawn organizer role applies at once). */
async function organizerRole(db: Database, userId: string) {
  const role = await roleOf(db, userId);
  return role && canOrganize(role) ? role : null;
}

/** An event the viewer may change: their own, or any for an administrator. */
async function requireOwnEvent(db: Database, userId: string, eventId: string) {
  const role = await organizerRole(db, userId);
  if (!role) {
    throw new ORPCError("FORBIDDEN");
  }
  const row = await eventById(db, eventId);
  if (!row || (row.organizerId !== userId && role !== "admin")) {
    throw new ORPCError("NOT_FOUND");
  }
  return row;
}

/** Campus events (IRL-01). */
export const events = {
  list: os.events.list.use(requireViewer).handler(async ({ context, input }) => {
    const db = context.database();
    const viewer = await requireAttendee(db, context.viewer.userId);
    const rows = await upcomingEvents(db, {
      viewerId: viewer.member.id,
      schoolSlug: viewer.member.schoolSlug,
      now: new Date(),
      onlyMine: input.filter === "mine",
    });
    return {
      events: rows.map((row) => toSummary(row, viewer.member.id)),
      canOrganize: (await organizerRole(db, context.viewer.userId)) !== null,
    };
  }),

  get: os.events.get.use(requireViewer).handler(async ({ context, input }) => {
    const db = context.database();
    const viewer = await requireAttendee(db, context.viewer.userId);
    const row = await requireEvent(db, input.eventId, viewer);
    const spot = row.spotId ? await spotById(db, row.spotId) : null;
    const event = {
      ...toSummary(row, viewer.member.id),
      description: row.description,
      spot: spot ? { id: spot.id, name: input.locale === "en" ? spot.nameEn : spot.nameFr } : null,
    };
    // Reciprocal and optional: the viewer sees their matches only while sharing their own answer.
    if (!row.myStatus || !attendanceVisible({ shares: row.myShare === true }, { shares: true })) {
      return { event, matchesGoing: null };
    }
    const sharing = await sharingAttendees(db, row.id, viewer.member.id);
    const matches = new Map((await activeMatchesOf(db, viewer.member.id)).map((m) => [m.otherId, m.id]));
    const candidates = sharing.filter((a) => matches.has(a.userId));
    const ids = candidates.map((a) => a.userId);
    const [members, relations, content, blind] = await Promise.all([
      loadMembers(db, ids),
      loadRelations(db, viewer.member.id, ids),
      loadProfileContent(db, ids),
      hiddenPhotos(db, viewer.member.id, ids),
    ]);
    const today = campusDate(new Date());
    const matchesGoing = candidates.flatMap((attendee) => {
      const other = members.get(attendee.userId);
      const matchId = matches.get(attendee.userId);
      if (!other || !matchId || !canViewProfile(viewer.member, other.member, { today, relations }).visible) {
        return [];
      }
      const photo = content.get(attendee.userId)?.photos[0];
      return [
        {
          userId: attendee.userId,
          matchId,
          firstName: other.firstName,
          photoUrl:
            photo && !blind.hidden.has(attendee.userId) ? signedPhotoUrl(photo.storageKey, "thumb") : null,
          status: attendee.status,
        },
      ];
    });
    return { event, matchesGoing };
  }),

  rsvp: os.events.rsvp.use(requireViewer).handler(async ({ context, input }) => {
    const db = context.database();
    const now = new Date();
    const viewer = await requireAttendee(db, context.viewer.userId);
    const row = await requireEvent(db, input.eventId, viewer);
    if (input.status === null) {
      await removeRsvp(db, row.id, viewer.member.id);
    } else {
      if (row.status !== "published" || eventEndsAt(row).getTime() <= now.getTime()) {
        throw new ORPCError("BAD_REQUEST", { message: "closed" });
      }
      await saveRsvp(db, {
        eventId: row.id,
        userId: viewer.member.id,
        status: input.status,
        shareWithMatches: input.shareWithMatches,
      });
    }
    return { event: toSummary(await requireEvent(db, row.id, viewer), viewer.member.id) };
  }),

  create: os.events.create.use(requireViewer).handler(async ({ context, input }) => {
    const db = context.database();
    if (!(await organizerRole(db, context.viewer.userId))) {
      throw new ORPCError("FORBIDDEN");
    }
    const values = await eventValues(db, input, new Date());
    return { eventId: await createEvent(db, context.viewer.userId, values) };
  }),

  update: os.events.update.use(requireViewer).handler(async ({ context, input }) => {
    const db = context.database();
    const row = await requireOwnEvent(db, context.viewer.userId, input.eventId);
    if (row.status !== "published") {
      throw new ORPCError("BAD_REQUEST", { message: "cancelled" });
    }
    await updateEvent(db, row.id, await eventValues(db, input, new Date()));
    return { eventId: row.id };
  }),

  cancel: os.events.cancel.use(requireViewer).handler(async ({ context, input }) => {
    const db = context.database();
    const row = await requireOwnEvent(db, context.viewer.userId, input.eventId);
    await cancelEvent(db, row.id);
    return { ok: true as const };
  }),
};
