/**
 * Date safety kit (IRL-03): before an accepted date, a member can share its
 * details (who, where, when) with a trusted person through a temporary link,
 * then is asked after the date whether everything went well. The trusted
 * person sees the answer on the same link.
 */
export const DATE_SAFETY_RULES = {
  /** "Tout s'est bien passé ?" comes this long after the start. */
  checkInAfterMinutes: 180,
  /** The link stops working this long after the start. */
  expiresAfterHours: 24,
  /** A date can be shared with a few people, not broadcast. */
  maxActivePerDate: 3,
  /** Links created per member and per day. */
  maxPerDay: 10,
} as const;

export const CHECK_IN_ANSWERS = ["ok", "help"] as const;
export type CheckInAnswer = (typeof CHECK_IN_ANSWERS)[number];

/** National numbers (docs/01, SAF-15). School resources live on the help page. */
export const EMERGENCY_NUMBERS = [
  { id: "112", href: "tel:112" },
  { id: "17", href: "tel:17" },
  { id: "114", href: "sms:114" },
  { id: "3919", href: "tel:3919" },
] as const;

export function shareTimes(startsAt: Date): { checkInAt: Date; expiresAt: Date } {
  return {
    checkInAt: new Date(startsAt.getTime() + DATE_SAFETY_RULES.checkInAfterMinutes * 60_000),
    expiresAt: new Date(startsAt.getTime() + DATE_SAFETY_RULES.expiresAfterHours * 3_600_000),
  };
}

export type ShareState = "active" | "revoked" | "expired";

export function shareState(
  share: { readonly expiresAt: Date; readonly revokedAt: Date | null },
  now: Date,
): ShareState {
  if (share.revokedAt) {
    return "revoked";
  }
  return share.expiresAt.getTime() <= now.getTime() ? "expired" : "active";
}

export type ShareCheck =
  | { ok: true }
  | { ok: false; reason: "not_accepted" | "over" | "too_many" | "rate_limited" };

/**
 * Can this date be shared now? Only an accepted date that has not expired
 * yet, within the per-date and per-day limits.
 */
export function checkShare(input: {
  readonly status: string;
  readonly startsAt: Date;
  readonly activeForDate: number;
  readonly createdToday: number;
  readonly now: Date;
}): ShareCheck {
  if (input.status !== "accepted") {
    return { ok: false, reason: "not_accepted" };
  }
  if (shareTimes(input.startsAt).expiresAt.getTime() <= input.now.getTime()) {
    return { ok: false, reason: "over" };
  }
  if (input.activeForDate >= DATE_SAFETY_RULES.maxActivePerDate) {
    return { ok: false, reason: "too_many" };
  }
  if (input.createdToday >= DATE_SAFETY_RULES.maxPerDay) {
    return { ok: false, reason: "rate_limited" };
  }
  return { ok: true };
}
