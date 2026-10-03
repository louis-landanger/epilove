/**
 * Gentle nudges (CHAT-09): matches never expire, but after a few days of
 * silence both members get one discreet reminder with ideas to restart the
 * conversation. Once per silence: a new message resets it.
 */
export const NUDGE_RULES = {
  silenceDays: 3,
  /** Campus hour at which nudges go out (an evening, not during class). */
  hour: 18,
} as const;

const DAY_MS = 86_400_000;

export function isSilent(lastActivityAt: Date, now: Date): boolean {
  return now.getTime() - lastActivityAt.getTime() >= NUDGE_RULES.silenceDays * DAY_MS;
}

/** True when the silence is long enough and no nudge was sent since the last activity. */
export function needsNudge(lastActivityAt: Date, nudgedAt: Date | null, now: Date): boolean {
  return isSilent(lastActivityAt, now) && (nudgedAt === null || nudgedAt < lastActivityAt);
}
