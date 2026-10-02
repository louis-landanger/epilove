import type { NotificationType } from "./types";

/**
 * Quiet hours (NOT-04): no push between 23:00 and 08:00 by default, campus
 * time. Notifications still reach the notification centre. Messages can be
 * let through on request; the safety check-in after a date (IRL-03) always is.
 */
export interface QuietHours {
  readonly enabled: boolean;
  /** Hour (0-23) when quiet hours start. */
  readonly startHour: number;
  /** Hour (0-23) when they end. */
  readonly endHour: number;
  readonly allowMessages: boolean;
}

export const DEFAULT_QUIET_HOURS: QuietHours = {
  enabled: true,
  startHour: 23,
  endHour: 8,
  allowMessages: false,
};

/** Hour of the day (0-23) of an instant in a time zone. */
export function localHour(instant: Date, timeZone: string): number {
  const hour = new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", hourCycle: "h23" }).format(
    instant,
  );
  return Number(hour);
}

/** Whether `hour` falls in the quiet window (which may wrap past midnight). */
export function inQuietHours(settings: QuietHours, hour: number): boolean {
  if (!settings.enabled || settings.startHour === settings.endHour) {
    return false;
  }
  return settings.startHour < settings.endHour
    ? hour >= settings.startHour && hour < settings.endHour
    : hour >= settings.startHour || hour < settings.endHour;
}

/** Can this notification be pushed now? Outside quiet hours, always. */
export function pushAllowedAt(
  type: NotificationType,
  settings: QuietHours,
  instant: Date,
  timeZone: string,
): boolean {
  if (!inQuietHours(settings, localHour(instant, timeZone))) {
    return true;
  }
  if (type === "date_check_in") {
    return true;
  }
  return type === "message_received" && settings.allowMessages;
}
