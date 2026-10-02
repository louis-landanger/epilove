import { DISCOVERY_RULES } from "./rules";

const DAY_MS = 86_400_000;

/**
 * Second chance (DEC-09): a profile one passed comes back after 45 days, but
 * only if it changed significantly since (a new approved photo, a new or
 * edited prompt answer). Likes never come back.
 */
export function canResurface(
  pass: { readonly at: Date },
  lastSignificantChangeAt: Date | null,
  now: Date,
): boolean {
  return (
    now.getTime() - pass.at.getTime() >= DISCOVERY_RULES.passCooldownDays * DAY_MS &&
    lastSignificantChangeAt !== null &&
    lastSignificantChangeAt > pass.at
  );
}

/** Whether a past swipe still keeps the profile out of the deck and the Drop. */
export function swipeBlocksCandidate(
  swipe: { readonly kind: string; readonly at: Date } | undefined,
  lastSignificantChangeAt: Date | null,
  now: Date,
): boolean {
  if (!swipe) {
    return false;
  }
  return swipe.kind !== "pass" || !canResurface(swipe, lastSignificantChangeAt, now);
}
