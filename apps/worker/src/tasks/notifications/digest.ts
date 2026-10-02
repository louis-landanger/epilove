import { isoWeek, LYON_CAMPUS } from "@epilove/core";
import { createDatabase, type Database } from "@epilove/db";
import { eventsBetween } from "@epilove/db/repositories/campus-events";
import { activeMatchesOf } from "@epilove/db/repositories/matches";
import {
  claimDigest,
  digestCounts,
  digestRecipients,
  markDigestSent,
  releaseDigest,
} from "@epilove/db/repositories/notifications";
import { currentSeason } from "@epilove/db/repositories/pact";
import {
  type DigestInput,
  digestIsEmpty,
  type EmailSender,
  localHour,
  renderDigest,
  smtpSenderFromEnv,
} from "@epilove/notifications";
import type { Task } from "graphile-worker";

const TIME_ZONE = LYON_CAMPUS.timeZone;
const WEEK_MS = 7 * 86_400_000;
/** Sunday from 18:00, campus time. */
const SEND_FROM_HOUR = 18;

const isSundayEvening = (now: Date) =>
  new Intl.DateTimeFormat("en-GB", { timeZone: TIME_ZONE, weekday: "short" }).format(now) === "Sun" &&
  localHour(now, TIME_ZONE) >= SEND_FROM_HOUR;

/**
 * Sends this week's digest (NOT-05) to every member who opted in by e-mail
 * for at least one group, once per ISO week. Only the groups they chose are
 * included; an empty digest is not sent (but counts as done).
 */
export async function sendWeeklyDigests(
  db: Database,
  sender: EmailSender,
  options: { now: Date; appUrl: string; only?: readonly string[] },
): Promise<{ sent: number; empty: number; failed: number }> {
  const { now } = options;
  const week = isoWeek(now, TIME_ZONE);
  const since = new Date(now.getTime() - WEEK_MS);
  const season = await currentSeason(db);
  const pactClosesAt =
    season && season.status === "open" && season.closesAt.getTime() > now.getTime() ? season.closesAt : null;
  const upcoming = await eventsBetween(db, now, new Date(now.getTime() + WEEK_MS));
  const stats = { sent: 0, empty: 0, failed: 0 };

  for (;;) {
    const recipients = (await digestRecipients(db, week)).filter(
      (r) => !options.only || options.only.includes(r.userId),
    );
    if (recipients.length === 0) {
      return stats;
    }
    for (const recipient of recipients) {
      if (!(await claimDigest(db, recipient.userId, week))) {
        continue;
      }
      const groups = new Set(recipient.groups);
      try {
        const counts = await digestCounts(db, recipient.userId, since);
        const unread = groups.has("messages")
          ? (await activeMatchesOf(db, recipient.userId)).filter((m) => m.unread > 0).length
          : null;
        const input: DigestInput = {
          likes: groups.has("likes") ? counts.likes : null,
          matches: groups.has("matches") ? counts.matches : null,
          unreadConversations: unread,
          events: groups.has("events")
            ? upcoming.filter((e) => e.schoolIds.length === 0 || e.schoolIds.includes(recipient.schoolId))
            : null,
          pactClosesAt: groups.has("pact") ? pactClosesAt : null,
          appUrl: options.appUrl,
          timeZone: TIME_ZONE,
        };
        if (digestIsEmpty(input)) {
          stats.empty++;
        } else {
          const content = renderDigest(input);
          await sender.send({ to: recipient.email, ...content });
          stats.sent++;
        }
        await markDigestSent(db, recipient.userId, week, now);
      } catch {
        // Retried by the next hourly run; the address and the cause are not logged.
        await releaseDigest(db, recipient.userId, week);
        stats.failed++;
      }
    }
    if (stats.failed > 0) {
      return stats;
    }
  }
}

/** Hourly on Sundays (the crontab has no time zone): sends from 18:00 campus time. */
export const weeklyDigest: Task = async (_payload, helpers) => {
  const url = process.env.DATABASE_URL;
  const sender = smtpSenderFromEnv();
  const now = new Date();
  if (!url || !sender || !isSundayEvening(now)) {
    return;
  }
  const { db, close } = createDatabase(url, { maxConnections: 1 });
  try {
    const stats = await sendWeeklyDigests(db, sender, {
      now,
      appUrl: process.env.APP_PUBLIC_URL ?? "http://localhost:3000",
    });
    helpers.logger.info(`weekly digests: ${stats.sent} sent, ${stats.empty} empty, ${stats.failed} failed`);
  } finally {
    await close();
  }
};
