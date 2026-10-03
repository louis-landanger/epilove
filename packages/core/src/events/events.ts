/**
 * Campus events (IRL-01): student associations (the "organizer" role) publish
 * their events; members answer "J'y vais" or "Peut-être" and may choose to
 * see which of their matches are going, only if they share their own answer.
 */
export const EVENT_RULES = {
  titleMaxLength: 80,
  organizerNameMaxLength: 60,
  descriptionMaxLength: 2000,
  venueMaxLength: 120,
  /** An event can be announced up to a year ahead. */
  maxLeadDays: 365,
  /** And lasts at most a day (a weekend gets one event per day). */
  maxDurationHours: 24,
  /** Without an end time, an event is listed for this long after it starts. */
  defaultDurationMinutes: 180,
} as const;

export const EVENT_STATUSES = ["published", "cancelled"] as const;
export type EventStatus = (typeof EVENT_STATUSES)[number];

export const RSVP_STATUSES = ["going", "maybe"] as const;
export type RsvpStatus = (typeof RSVP_STATUSES)[number];

export const ORGANIZER_ROLES = ["organizer", "admin"] as const;

/** Only associations and administrators publish events. */
export function canOrganize(role: string): boolean {
  return (ORGANIZER_ROLES as readonly string[]).includes(role);
}

export interface EventDraft {
  readonly title: string;
  readonly organizerName: string;
  readonly description: string;
  readonly venue: string | null;
  readonly spotId: string | null;
  readonly startsAt: Date;
  readonly endsAt: Date | null;
}

export type EventDraftReason =
  | "title_required"
  | "organizer_required"
  | "no_place"
  | "in_the_past"
  | "too_far"
  | "ends_before_start"
  | "too_long";

export function checkEventDraft(
  draft: EventDraft,
  now: Date,
): { ok: true } | { ok: false; reason: EventDraftReason } {
  if (!draft.title.trim()) {
    return { ok: false, reason: "title_required" };
  }
  if (!draft.organizerName.trim()) {
    return { ok: false, reason: "organizer_required" };
  }
  if (!draft.spotId && !draft.venue?.trim()) {
    return { ok: false, reason: "no_place" };
  }
  if (draft.startsAt.getTime() < now.getTime()) {
    return { ok: false, reason: "in_the_past" };
  }
  if (draft.startsAt.getTime() - now.getTime() > EVENT_RULES.maxLeadDays * 86_400_000) {
    return { ok: false, reason: "too_far" };
  }
  if (draft.endsAt) {
    const duration = draft.endsAt.getTime() - draft.startsAt.getTime();
    if (duration <= 0) {
      return { ok: false, reason: "ends_before_start" };
    }
    if (duration > EVENT_RULES.maxDurationHours * 3_600_000) {
      return { ok: false, reason: "too_long" };
    }
  }
  return { ok: true };
}

/** When an event stops being listed (and stops accepting answers). */
export function eventEndsAt(event: { readonly startsAt: Date; readonly endsAt: Date | null }): Date {
  return event.endsAt ?? new Date(event.startsAt.getTime() + EVENT_RULES.defaultDurationMinutes * 60_000);
}

/** An event restricted to some schools is only shown to their students; no school means the whole campus. */
export function eventOpenTo(event: { readonly schoolSlugs: readonly string[] }, schoolSlug: string): boolean {
  return event.schoolSlugs.length === 0 || event.schoolSlugs.includes(schoolSlug);
}

/**
 * Attendance between matches is reciprocal and optional: the viewer sees a
 * match going to the event only when both chose to share it. The caller
 * still checks the access policies (an active match, no block, no ban).
 */
export function attendanceVisible(
  viewer: { readonly shares: boolean },
  other: { readonly shares: boolean },
): boolean {
  return viewer.shares && other.shares;
}
