import { calendarDateIn, canMessage, LYON_CAMPUS, NUDGE_RULES } from "@epilove/core";
import { createDatabase, type Database } from "@epilove/db";
import { matchesToNudge, recordNudges } from "@epilove/db/repositories/matches";
import { loadMembers, loadRelationsAmong } from "@epilove/db/repositories/members";
import type { Task } from "graphile-worker";

/**
 * Gentle nudges (CHAT-09): silent matches get one discreet reminder, for
 * both members, if they may still message each other.
 */
export async function sendNudges(db: Database, now: Date): Promise<number> {
  const candidates = await matchesToNudge(db, now, NUDGE_RULES.silenceDays);
  if (candidates.length === 0) {
    return 0;
  }
  const ids = [...new Set(candidates.flatMap((c) => [c.userLow, c.userHigh]))];
  const [members, relations] = await Promise.all([loadMembers(db, ids), loadRelationsAmong(db, ids)]);
  const context = { today: calendarDateIn(LYON_CAMPUS.timeZone, now), relations };
  const eligible = candidates.filter((c) => {
    const low = members.get(c.userLow);
    const high = members.get(c.userHigh);
    return low && high && canMessage(low.member, high.member, context).allowed;
  });
  await recordNudges(
    db,
    eligible.map((c) => ({ id: c.id, members: [c.userLow, c.userHigh] })),
    now,
  );
  return eligible.length;
}

function campusHour(now: Date): number {
  return Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: LYON_CAMPUS.timeZone,
      hour: "2-digit",
      hourCycle: "h23",
    }).format(now),
  );
}

/** Hourly; sends at NUDGE_RULES.hour, campus time (the crontab has no time zone). */
export const chatNudgeTick: Task = async (_payload, helpers) => {
  const url = process.env.DATABASE_URL;
  const now = new Date();
  if (!url || campusHour(now) !== NUDGE_RULES.hour) {
    return;
  }
  const { db, close } = createDatabase(url, { maxConnections: 2 });
  try {
    helpers.logger.info(`nudges sent: ${await sendNudges(db, now)}`);
  } finally {
    await close();
  }
};
