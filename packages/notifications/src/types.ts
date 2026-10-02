/**
 * Notification types (NOT-01 to NOT-03). One entry in the notification centre
 * per event; push delivery depends on the member's preferences.
 */
export const NOTIFICATION_TYPES = [
  "like_received",
  "superlike_received",
  "match_created",
  "message_received",
  "chat_nudge",
  "drop_ready",
  "pact_reveal",
  "event_cancelled",
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export const isNotificationType = (value: string): value is NotificationType =>
  (NOTIFICATION_TYPES as readonly string[]).includes(value);

/** Preference groups shown in the settings (NOT-03): a member thinks in "messages", not in event names. */
export const NOTIFICATION_GROUPS = {
  likes: ["like_received", "superlike_received"],
  matches: ["match_created"],
  messages: ["message_received", "chat_nudge"],
  drop: ["drop_ready"],
  pact: ["pact_reveal"],
  events: ["event_cancelled"],
} as const satisfies Record<string, readonly NotificationType[]>;
export type NotificationGroup = keyof typeof NOTIFICATION_GROUPS;
export const NOTIFICATION_GROUP_NAMES = Object.keys(NOTIFICATION_GROUPS) as NotificationGroup[];

export function groupOf(type: NotificationType): NotificationGroup {
  return (Object.entries(NOTIFICATION_GROUPS) as [NotificationGroup, readonly NotificationType[]][]).find(
    ([, types]) => types.includes(type),
  )?.[0] as NotificationGroup;
}

export const NOTIFICATION_CHANNELS = ["push", "email"] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

/** Defaults: push on for everything, email off (the weekly digest is opt-in, NOT-05). */
export const DEFAULT_CHANNELS: Readonly<Record<NotificationChannel, boolean>> = { push: true, email: false };

/** Where a notification leads in the app. */
export function notificationUrl(
  type: NotificationType,
  payload: { matchId?: string; eventId?: string } | null,
): string {
  switch (type) {
    case "match_created":
    case "message_received":
    case "chat_nudge":
      return payload?.matchId ? `/messages/${payload.matchId}` : "/messages";
    case "like_received":
    case "superlike_received":
      return "/likes";
    case "drop_ready":
      return "/decouvrir";
    case "pact_reveal":
      return "/campus/pacte";
    case "event_cancelled":
      return payload?.eventId ? `/campus/evenements/${payload.eventId}` : "/campus/evenements";
  }
}
