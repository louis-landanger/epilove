import { EVENT_RULES, EVENT_STATUSES, RSVP_STATUSES, SCHOOL_SLUGS } from "@epilove/core";
import { oc } from "@orpc/contract";
import { z } from "zod";
import { contentLocale } from "./questionnaire";

/** A campus event as a member sees it (IRL-01). */
export const eventSummary = z.object({
  id: z.uuid(),
  title: z.string(),
  organizerName: z.string(),
  venue: z.string(),
  startsAt: z.iso.datetime(),
  endsAt: z.iso.datetime().nullable(),
  status: z.enum(EVENT_STATUSES),
  /** Empty: the whole campus. */
  schoolSlugs: z.array(z.string()),
  going: z.number().int(),
  maybe: z.number().int(),
  /** The viewer's own answer. */
  mine: z.object({ status: z.enum(RSVP_STATUSES), shareWithMatches: z.boolean() }).nullable(),
  /** The viewer organizes it (and may edit or cancel it). */
  organizing: z.boolean(),
});
export type EventSummary = z.infer<typeof eventSummary>;

export const eventDetail = eventSummary.extend({
  description: z.string(),
  spot: z.object({ id: z.uuid(), name: z.string() }).nullable(),
});
export type EventDetail = z.infer<typeof eventDetail>;

/** A match going to the event: shown only when both chose to share it. */
export const attendingMatch = z.object({
  userId: z.uuid(),
  matchId: z.uuid(),
  firstName: z.string(),
  photoUrl: z.string().nullable(),
  status: z.enum(RSVP_STATUSES),
});
export type AttendingMatch = z.infer<typeof attendingMatch>;

export const eventInput = z.object({
  title: z.string().trim().min(1).max(EVENT_RULES.titleMaxLength),
  organizerName: z.string().trim().min(1).max(EVENT_RULES.organizerNameMaxLength),
  description: z.string().trim().max(EVENT_RULES.descriptionMaxLength).default(""),
  venue: z.string().trim().max(EVENT_RULES.venueMaxLength).nullable().default(null),
  spotId: z.uuid().nullable().default(null),
  startsAt: z.iso.datetime(),
  endsAt: z.iso.datetime().nullable().default(null),
  /** Empty: the whole campus. */
  schoolSlugs: z.array(z.enum(SCHOOL_SLUGS)).max(SCHOOL_SLUGS.length).default([]),
});
export type EventInput = z.infer<typeof eventInput>;

export const eventsContract = {
  /** Upcoming events open to the viewer's school; `mine`: answered or organized. */
  list: oc
    .input(z.object({ filter: z.enum(["upcoming", "mine"]).default("upcoming") }))
    .output(z.object({ events: z.array(eventSummary), canOrganize: z.boolean() })),
  /** One event, with the matches going when the viewer shares their own answer. */
  get: oc
    .input(z.object({ eventId: z.uuid(), locale: contentLocale }))
    .output(z.object({ event: eventDetail, matchesGoing: z.array(attendingMatch).nullable() })),
  /** "J'y vais", "Peut-être", or null to withdraw. Idempotent. */
  rsvp: oc
    .input(
      z.object({
        eventId: z.uuid(),
        status: z.enum(RSVP_STATUSES).nullable(),
        shareWithMatches: z.boolean().default(false),
      }),
    )
    .output(z.object({ event: eventSummary })),
  /** Organizers and administrators only. */
  create: oc.input(eventInput).output(z.object({ eventId: z.uuid() })),
  update: oc.input(eventInput.extend({ eventId: z.uuid() })).output(z.object({ eventId: z.uuid() })),
  /** Tells the members who answered. */
  cancel: oc.input(z.object({ eventId: z.uuid() })).output(z.object({ ok: z.literal(true) })),
  /** Flash (IRL-04): one's code for the next 30 seconds, during the event. */
  flashCode: oc
    .input(z.object({ eventId: z.uuid() }))
    .output(z.object({ code: z.string(), expiresAt: z.iso.datetime() })),
  /** Scans someone's code: a match once both scanned each other. */
  flashScan: oc.input(z.object({ eventId: z.uuid(), code: z.string().min(4).max(20) })).output(
    z.object({
      outcome: z.enum(["waiting", "matched"]),
      match: z.object({ matchId: z.uuid(), firstName: z.string() }).nullable(),
    }),
  ),
};
