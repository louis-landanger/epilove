import {
  deleteSubscription,
  listNotifications,
  markNotificationsRead,
  notificationPreferencesOf,
  quietHoursOf,
  saveNotificationPreferences,
  saveQuietHours,
  saveSubscription,
  unreadCount,
} from "@epilove/db/repositories/notifications";
import { DEFAULT_QUIET_HOURS } from "@epilove/notifications/quiet-hours";
import {
  DEFAULT_CHANNELS,
  isNotificationType,
  NOTIFICATION_GROUP_NAMES,
  type NOTIFICATION_GROUPS,
  notificationUrl,
} from "@epilove/notifications/types";
import { os, requireViewer } from "../procedures";

type Groups = Record<keyof typeof NOTIFICATION_GROUPS, { push: boolean; email: boolean }>;

export const notifications = {
  list: os.notifications.list.use(requireViewer).handler(async ({ context, input }) => {
    const db = context.database();
    const [page, unread] = await Promise.all([
      listNotifications(db, context.viewer.userId, { before: input.before, limit: input.limit }),
      unreadCount(db, context.viewer.userId),
    ]);
    return {
      unread,
      hasMore: page.hasMore,
      items: page.items.flatMap((item) =>
        isNotificationType(item.type)
          ? [
              {
                id: item.id,
                type: item.type,
                url: notificationUrl(
                  item.type,
                  item.payload as { matchId?: string; eventId?: string } | null,
                ),
                read: item.readAt !== null,
                createdAt: item.createdAt.toISOString(),
              },
            ]
          : [],
      ),
    };
  }),

  unreadCount: os.notifications.unreadCount.use(requireViewer).handler(async ({ context }) => ({
    unread: await unreadCount(context.database(), context.viewer.userId),
  })),

  markRead: os.notifications.markRead.use(requireViewer).handler(async ({ context, input }) => {
    const db = context.database();
    await markNotificationsRead(db, context.viewer.userId, input.ids);
    return { unread: await unreadCount(db, context.viewer.userId) };
  }),

  preferences: os.notifications.preferences.use(requireViewer).handler(async ({ context }) => {
    const stored = await notificationPreferencesOf(context.database(), context.viewer.userId);
    const groups = Object.fromEntries(
      NOTIFICATION_GROUP_NAMES.map((group) => [group, stored.get(group) ?? DEFAULT_CHANNELS]),
    ) as Groups;
    return { groups };
  }),

  quietHours: os.notifications.quietHours.use(requireViewer).handler(async ({ context }) => {
    return (await quietHoursOf(context.database(), context.viewer.userId)) ?? { ...DEFAULT_QUIET_HOURS };
  }),

  saveQuietHours: os.notifications.saveQuietHours.use(requireViewer).handler(async ({ context, input }) => {
    await saveQuietHours(context.database(), context.viewer.userId, input);
    return (await quietHoursOf(context.database(), context.viewer.userId)) ?? { ...DEFAULT_QUIET_HOURS };
  }),

  savePreferences: os.notifications.savePreferences.use(requireViewer).handler(async ({ context, input }) => {
    const groups = new Map(
      NOTIFICATION_GROUP_NAMES.flatMap((group) => {
        const value = input.groups[group];
        return value ? [[group, value] as const] : [];
      }),
    );
    await saveNotificationPreferences(context.database(), context.viewer.userId, groups);
    const stored = await notificationPreferencesOf(context.database(), context.viewer.userId);
    return {
      groups: Object.fromEntries(
        NOTIFICATION_GROUP_NAMES.map((group) => [group, stored.get(group) ?? DEFAULT_CHANNELS]),
      ) as Groups,
    };
  }),

  pushConfig: os.notifications.pushConfig.handler(() => ({
    publicKey: process.env.VAPID_PUBLIC_KEY ?? null,
  })),

  subscribe: os.notifications.subscribe.use(requireViewer).handler(async ({ context, input }) => {
    await saveSubscription(context.database(), context.viewer.userId, {
      endpoint: input.endpoint,
      p256dh: input.keys.p256dh,
      auth: input.keys.auth,
      userAgent: input.userAgent,
    });
    return { ok: true as const };
  }),

  unsubscribe: os.notifications.unsubscribe.use(requireViewer).handler(async ({ context, input }) => {
    await deleteSubscription(context.database(), input.endpoint, context.viewer.userId);
    return { ok: true as const };
  }),
};
