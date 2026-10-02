import type { Database } from "@epilove/db";
import {
  deleteSubscription,
  isDiscreet,
  notificationPreferencesOf,
  otherFirstName,
  type PendingPush,
  subscriptionsOf,
  touchSubscription,
} from "@epilove/db/repositories/notifications";
import {
  DEFAULT_CHANNELS,
  groupOf,
  isNotificationType,
  type PushSender,
  renderPush,
} from "@epilove/notifications";
import { type Publisher, personalChannel } from "@epilove/realtime";

/**
 * Web Push delivery (NOT-01): respects the member's preferences (NOT-03), stays
 * discreet by default (SAF-06), and does not buzz a phone when the member is
 * already in the app (an open realtime connection shows it live).
 */
export function createPushDelivery(options: { db: Database; sender: PushSender; publisher: Publisher }) {
  const { db, sender, publisher } = options;
  return async (pending: readonly PendingPush[]) => {
    const byUser = new Map<string, PendingPush[]>();
    for (const item of pending) {
      byUser.set(item.userId, [...(byUser.get(item.userId) ?? []), item]);
    }
    for (const [userId, items] of byUser) {
      if (await publisher.isOnline(personalChannel(userId))) {
        continue;
      }
      const [preferences, discreet, subscriptions] = await Promise.all([
        notificationPreferencesOf(db, userId),
        isDiscreet(db, userId),
        subscriptionsOf(db, userId),
      ]);
      if (subscriptions.length === 0) {
        continue;
      }
      for (const item of items) {
        if (
          !isNotificationType(item.type) ||
          !(preferences.get(groupOf(item.type)) ?? DEFAULT_CHANNELS).push
        ) {
          continue;
        }
        const name =
          !discreet && item.payload?.matchId ? await otherFirstName(db, item.payload.matchId, userId) : null;
        const content = renderPush(item.type, { discreet, otherFirstName: name, payload: item.payload });
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
