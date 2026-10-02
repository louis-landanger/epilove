/**
 * Discovery rules and quotas (docs/01-fonctionnalites.md, "Règles et quotas").
 * Initial values, to be tuned with real data. A like must stay rare to keep its value.
 */
export const DISCOVERY_RULES = {
  likesPerDay: 20,
  superlikesPerDay: 1,
  undosPerDay: 1,
  /** Accounts younger than this get the reduced quota below. */
  newAccountHours: 48,
  newAccountLikesPerDay: 10,
  /** A pass hides the profile from the deck for this long (DEC-09 brings it back later). */
  passCooldownDays: 45,
  /** An undo (DEC-11) only works on a recent pass. */
  undoWindowHours: 24,
  commentMaxLength: 150,
  /** Newcomers get extra exposure for this long (docs/06-matching.md, section 6). */
  newcomerBoostHours: 72,
} as const;

const HOUR = 3_600_000;

export function isNewAccount(accountCreatedAt: Date, now: Date): boolean {
  return now.getTime() - accountCreatedAt.getTime() < DISCOVERY_RULES.newAccountHours * HOUR;
}

/** Daily like budget (super likes count as likes too). */
export function dailyLikeQuota(accountCreatedAt: Date, now: Date): number {
  return isNewAccount(accountCreatedAt, now)
    ? DISCOVERY_RULES.newAccountLikesPerDay
    : DISCOVERY_RULES.likesPerDay;
}

export interface QuotaUsage {
  /** Likes and super likes sent today (campus day). */
  readonly likesToday: number;
  readonly superlikesToday: number;
  readonly undosToday: number;
}

export interface QuotaStatus {
  readonly likesLeft: number;
  readonly superlikesLeft: number;
  readonly undosLeft: number;
}

export function quotaStatus(usage: QuotaUsage, accountCreatedAt: Date, now: Date): QuotaStatus {
  const likesLeft = Math.max(0, dailyLikeQuota(accountCreatedAt, now) - usage.likesToday);
  return {
    likesLeft,
    superlikesLeft: Math.min(
      likesLeft,
      Math.max(0, DISCOVERY_RULES.superlikesPerDay - usage.superlikesToday),
    ),
    undosLeft: Math.max(0, DISCOVERY_RULES.undosPerDay - usage.undosToday),
  };
}

export type Decision = "like" | "superlike" | "pass";

export type DecisionCheck =
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly reason:
        | "quota_exceeded"
        | "superlike_quota_exceeded"
        | "comment_required"
        | "comment_too_long";
    };

/** Validates a decision against the quotas. A super like always comes with a comment. */
export function checkDecision(
  decision: Decision,
  comment: string | null,
  status: QuotaStatus,
): DecisionCheck {
  const trimmed = comment?.trim() ?? "";
  if (trimmed.length > DISCOVERY_RULES.commentMaxLength) {
    return { ok: false, reason: "comment_too_long" };
  }
  if (decision === "pass") {
    return { ok: true };
  }
  if (status.likesLeft <= 0) {
    return { ok: false, reason: "quota_exceeded" };
  }
  if (decision === "superlike") {
    if (status.superlikesLeft <= 0) {
      return { ok: false, reason: "superlike_quota_exceeded" };
    }
    if (trimmed.length === 0) {
      return { ok: false, reason: "comment_required" };
    }
  }
  return { ok: true };
}

/** Start of the campus day containing `now`, as an instant (for "today" counters). */
export function startOfCampusDay(now: Date, timeZone: string): Date {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  const elapsed = ((get("hour") * 60 + get("minute")) * 60 + get("second")) * 1000 + now.getMilliseconds();
  return new Date(now.getTime() - elapsed);
}
