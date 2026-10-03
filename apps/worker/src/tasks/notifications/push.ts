import { LYON_CAMPUS } from "@epilove/core";
import type { Database } from "@epilove/db";
import {
  deleteSubscription,
  isDiscreet,
  localeOf,
  notificationPreferencesOf,
  otherFirstName,
  type PendingPush,
  quietHoursOf,
  subscriptionsOf,
  touchSubscription,
} from "@epilove/db/repositories/notifications";
import {
  DEFAULT_CHANNELS,
  DEFAULT_QUIET_HOURS,
  groupOf,
  isNotificationType,
  type PushSender,
  pushAllowedAt,
  renderPush,
} from "@epilove/notifications";
import { type Publisher, personalChannel } from "@epilove/realtime";

/**
 * Web Push delivery (NOT-01): respects the member's preferences (NOT-03) and
 * quiet hours (NOT-04), stays discreet by default (SAF-06), and does not buzz
 * a phone when the member is already in the app (an open realtime connection
 * shows it live). A push held by quiet hours is not sent later: the
 * notification waits in the notification centre.
 */
export function createPushDelivery(options: {
  db: Database;
  sender: PushSender;
  publisher: Publisher;
  now?: () => Date;
}) {
  const { db, sender, publisher } = options;
  const now = options.now ?? (() => new Date());
  return async (pending: readonly PendingPush[]) => {
    const byUser = new Map<string, PendingPush[]>();
    for (const item of pending) {
      byUser.set(item.userId, [...(byUser.get(item.userId) ?? []), item]);
    }
    for (const [userId, items] of byUser) {
      if (await publisher.isOnline(personalChannel(userId))) {
        continue;
      }
      const [preferences, discreet, subscriptions, quiet, locale] = await Promise.all([
        notificationPreferencesOf(db, userId),
        isDiscreet(db, userId),
        subscriptionsOf(db, userId),
        quietHoursOf(db, userId),
        localeOf(db, userId),
      ]);
      if (subscriptions.length === 0) {
        continue;
      }
      for (const item of items) {
        if (
          !isNotificationType(item.type) ||
          !(preferences.get(groupOf(item.type)) ?? DEFAULT_CHANNELS).push ||
          !pushAllowedAt(item.type, quiet ?? DEFAULT_QUIET_HOURS, now(), LYON_CAMPUS.timeZone)
        ) {
          continue;
        }
        const name =
          !discreet && item.payload?.matchId ? await otherFirstName(db, item.payload.matchId, userId) : null;
        const content = renderPush(item.type, {
          discreet,
          otherFirstName: name,
          locale,
          payload: item.payload,
        });
        for (const subscription of subscriptions) {
          const result = await sender.send(subscription, content);
          if (result === "gone") {
            await deleteSubscription(db, subscription.endpoint);
          } else if (result === "sent") {
            await touchSubscription(db, subscription.endpoint);
          }
        }
      }
    }
  };
}
