import { and, desc, eq, gte, inArray, isNull, sql } from "drizzle-orm";
import type { Database } from "../client";
import {
  match,
  notification,
  notificationPreference,
  preferences,
  profile,
  pushSubscription,
} from "../schema";

/** Notification centre (NOT-02), preferences (NOT-03) and Web Push subscriptions (NOT-01). */

export async function listNotifications(
  db: Database,
  userId: string,
  options: { before?: string; limit: number },
) {
  // Keyset pagination on (created_at, id): ids are not always in creation order (imports, seeds).
  const [cursor] = options.before
    ? await db
        .select({ createdAt: notification.createdAt, id: notification.id })
        .from(notification)
        .where(and(eq(notification.id, options.before), eq(notification.userId, userId)))
    : [];
  const rows = await db
    .select({
      id: notification.id,
      type: notification.type,
      payload: notification.payload,
      readAt: notification.readAt,
      createdAt: notification.createdAt,
    })
    .from(notification)
    .where(
      and(
        eq(notification.userId, userId),
        cursor
          ? sql`(${notification.createdAt}, ${notification.id}) < (${cursor.createdAt.toISOString()}::timestamptz, ${cursor.id}::uuid)`
          : undefined,
      ),
    )
    .orderBy(desc(notification.createdAt), desc(notification.id))
    .limit(options.limit + 1);
  return { items: rows.slice(0, options.limit), hasMore: rows.length > options.limit };
}

export async function unreadCount(db: Database, userId: string): Promise<number> {
  const [row] = await db
    .select({ value: sql<number>`count(*)::int` })
    .from(notification)
    .where(and(eq(notification.userId, userId), isNull(notification.readAt)));
  return row?.value ?? 0;
}

/** Marks some (or all) of the member's notifications as read. */
export async function markNotificationsRead(db: Database, userId: string, ids: readonly string[] | "all") {
  await db
    .update(notification)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(notification.userId, userId),
        isNull(notification.readAt),
        ids === "all" ? undefined : inArray(notification.id, [...ids]),
      ),
    );
}

export interface ChannelPreference {
  readonly push: boolean;
  readonly email: boolean;
}

export async function notificationPreferencesOf(db: Database, userId: string) {
  const rows = await db
    .select({
      group: notificationPreference.group,
      push: notificationPreference.push,
      email: notificationPreference.email,
    })
    .from(notificationPreference)
    .where(eq(notificationPreference.userId, userId));
  return new Map<string, ChannelPreference>(rows.map((r) => [r.group, { push: r.push, email: r.email }]));
}

export async function saveNotificationPreferences(
  db: Database,
  userId: string,
  groups: ReadonlyMap<string, ChannelPreference>,
) {
  for (const [group, channels] of groups) {
    await db
      .insert(notificationPreference)
      .values({ userId, group, ...channels })
      .onConflictDoUpdate({
        target: [notificationPreference.userId, notificationPreference.group],
        set: { ...channels, updatedAt: new Date() },
      });
  }
}

/** Discreet notifications setting (SAF-06), stored with session A's preferences. Discreet unless explicitly off. */
export async function isDiscreet(db: Database, userId: string): Promise<boolean> {
  const [row] = await db
    .select({ discreet: preferences.discreetNotifications })
    .from(preferences)
    .where(eq(preferences.userId, userId));
  return row?.discreet ?? true;
}

export async function saveSubscription(
  db: Database,
  userId: string,
  subscription: { endpoint: string; p256dh: string; auth: string; userAgent: string | null },
) {
  // An endpoint belongs to one device: if another member used this browser before, it moves.
  await db
    .insert(pushSubscription)
    .values({ userId, ...subscription })
    .onConflictDoUpdate({
      target: pushSubscription.endpoint,
      set: {
        userId,
        p256dh: subscription.p256dh,
        auth: subscription.auth,
        userAgent: subscription.userAgent,
      },
    });
}

export async function deleteSubscription(db: Database, endpoint: string, userId?: string) {
  await db
    .delete(pushSubscription)
    .where(
      and(eq(pushSubscription.endpoint, endpoint), userId ? eq(pushSubscription.userId, userId) : undefined),
    );
}

export async function subscriptionsOf(db: Database, userId: string) {
  return db
    .select({
      endpoint: pushSubscription.endpoint,
      p256dh: pushSubscription.p256dh,
      auth: pushSubscription.auth,
    })
    .from(pushSubscription)
    .where(eq(pushSubscription.userId, userId));
}

export async function touchSubscription(db: Database, endpoint: string) {
  await db
    .update(pushSubscription)
    .set({ lastSuccessAt: new Date() })
    .where(eq(pushSubscription.endpoint, endpoint));
}

export interface PendingPush {
  readonly id: string;
  readonly userId: string;
  readonly type: string;
  readonly payload: { matchId?: string } | null;
}

/**
 * Claims notifications not pushed yet (recent ones only: an old notification
 * is not worth a push), hands them to `deliver`, then marks them as handled.
 * Concurrent workers skip each other's rows.
 */
export async function processPendingPushes(
  db: Database,
  deliver: (pending: readonly PendingPush[]) => Promise<void>,
  options: { maxAgeMinutes?: number; limit?: number; userId?: string } = {},
): Promise<number> {
  const since = new Date(Date.now() - (options.maxAgeMinutes ?? 60) * 60_000);
  return db.transaction(async (tx) => {
    const rows = await tx
      .select({
        id: notification.id,
        userId: notification.userId,
        type: notification.type,
        payload: notification.payload,
      })
      .from(notification)
      .where(
        and(
          isNull(notification.pushedAt),
          gte(notification.createdAt, since),
          // Scoped runs (one member) are used by tests running next to a development worker.
          options.userId ? eq(notification.userId, options.userId) : undefined,
        ),
      )
      .orderBy(notification.createdAt)
      .limit(options.limit ?? 100)
      .for("update", { skipLocked: true });
    if (rows.length === 0) {
      return 0;
    }
    await deliver(rows.map((r) => ({ ...r, payload: (r.payload as PendingPush["payload"]) ?? null })));
    await tx
      .update(notification)
      .set({ pushedAt: new Date() })
      .where(
        inArray(
          notification.id,
          rows.map((r) => r.id),
        ),
      );
    return rows.length;
  });
}

/** First name of the other member of a match, for non-discreet notifications. */
export async function otherFirstName(db: Database, matchId: string, userId: string): Promise<string | null> {
  const [row] = await db
    .select({ userLow: match.userLow, userHigh: match.userHigh })
    .from(match)
    .where(eq(match.id, matchId));
  if (!row) {
    return null;
  }
  const otherId = row.userLow === userId ? row.userHigh : row.userLow;
  const [other] = await db
    .select({ firstName: profile.firstName })
    .from(profile)
    .where(eq(profile.userId, otherId));
  return other?.firstName ?? null;
}
