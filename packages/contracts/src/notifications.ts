import { oc } from "@orpc/contract";
import { z } from "zod";

export const notificationItem = z.object({
  id: z.uuid(),
  type: z.string(),
  /** Where the notification leads. Never a first name or a message: the screen renders the text. */
  url: z.string(),
  read: z.boolean(),
  createdAt: z.iso.datetime(),
});
export type NotificationItem = z.infer<typeof notificationItem>;

export const channelPreference = z.object({ push: z.boolean(), email: z.boolean() });
export const notificationPreferences = z.object({
  groups: z.record(z.enum(["likes", "matches", "messages", "drop", "pact", "events"]), channelPreference),
});
export type NotificationPreferencesView = z.infer<typeof notificationPreferences>;

/** Quiet hours (NOT-04), in campus time. */
export const quietHoursView = z.object({
  enabled: z.boolean(),
  startHour: z.number().int().min(0).max(23),
  endHour: z.number().int().min(0).max(23),
  allowMessages: z.boolean(),
});
export type QuietHoursView = z.infer<typeof quietHoursView>;

export const pushSubscriptionInput = z.object({
  endpoint: z.url().max(2048),
  keys: z.object({ p256dh: z.string().min(1).max(512), auth: z.string().min(1).max(512) }),
  userAgent: z.string().max(300).nullable().default(null),
});

export const notificationsContract = {
  /** Notification centre (NOT-02), newest first, cursor pagination. */
  list: oc
    .input(z.object({ before: z.uuid().optional(), limit: z.number().int().min(1).max(50).default(30) }))
    .output(z.object({ items: z.array(notificationItem), hasMore: z.boolean(), unread: z.number().int() })),
  unreadCount: oc.output(z.object({ unread: z.number().int() })),
  markRead: oc
    .input(z.object({ ids: z.union([z.array(z.uuid()).max(100), z.literal("all")]) }))
    .output(z.object({ unread: z.number().int() })),
  /** Preferences per group and channel (NOT-03). */
  preferences: oc.output(notificationPreferences),
  savePreferences: oc.input(notificationPreferences).output(notificationPreferences),
  /** Quiet hours (NOT-04): no push in that window, except what the member lets through. */
  quietHours: oc.output(quietHoursView),
  saveQuietHours: oc.input(quietHoursView).output(quietHoursView),
  /** Public VAPID key for the browser, or null when push is not configured. */
  pushConfig: oc.output(z.object({ publicKey: z.string().nullable() })),
  subscribe: oc.input(pushSubscriptionInput).output(z.object({ ok: z.literal(true) })),
  unsubscribe: oc.input(z.object({ endpoint: z.url().max(2048) })).output(z.object({ ok: z.literal(true) })),
};
