/**
 * "Dispo" status (IRL-05): "Dispo pour un café au campus jusqu'à 16 h",
 * shown to one's matches only and gone by itself at the chosen time. Preset
 * activities and places: no free text, so nothing to moderate.
 */
export const AVAILABILITY_ACTIVITIES = ["coffee", "lunch", "study", "walk", "sport", "drink"] as const;
export type AvailabilityActivity = (typeof AVAILABILITY_ACTIVITIES)[number];

export const AVAILABILITY_AREAS = ["campus", "city"] as const;
export type AvailabilityArea = (typeof AVAILABILITY_AREAS)[number];

export const AVAILABILITY_RULES = {
  minMinutes: 15,
  maxHours: 12,
} as const;

export function checkAvailability(
  until: Date,
  now: Date,
): { ok: true } | { ok: false; reason: "too_short" | "too_long" } {
  const ms = until.getTime() - now.getTime();
  if (ms < AVAILABILITY_RULES.minMinutes * 60_000) {
    return { ok: false, reason: "too_short" };
  }
  if (ms > AVAILABILITY_RULES.maxHours * 3_600_000) {
    return { ok: false, reason: "too_long" };
  }
  return { ok: true };
}

/**
 * Shown to a match while it lasts, and only when the member is plainly
 * active (a paused account shows nothing).
 */
export function availabilityShown(
  status: { readonly until: Date } | null | undefined,
  member: { readonly status: string },
  now: Date,
): boolean {
  return Boolean(status) && member.status === "active" && (status?.until.getTime() ?? 0) > now.getTime();
}
