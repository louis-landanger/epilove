import { dropSchedule, LYON_CAMPUS } from "@atomes/core";
import { createDatabase, type Database } from "@atomes/db";
import { dropRunOf, publishDrops } from "@atomes/db/repositories/discovery-drop";
import type { Task } from "graphile-worker";
import { computeDrops } from "./compute";

/**
 * Drop scheduler, every minute: computes today's Drop from 20:30 and
 * publishes it from 21:00, campus time (the crontab itself has no time
 * zone). Both steps are idempotent, so a missed minute or a restart only
 * delays them.
 */
export async function dropTick(db: Database, now: Date, log: (line: string) => void = () => {}) {
  const schedule = dropSchedule(now, LYON_CAMPUS.timeZone);
  if (!schedule.computeDue) {
    return;
  }
  let run = await dropRunOf(db, schedule.day);
  if (!run?.computedAt) {
    const stats = await computeDrops(db, { day: schedule.day, now });
    if (stats) {
      log(`drop computed: ${stats.withDrop} drops, ${stats.profiles} profiles in ${stats.milliseconds} ms`);
    }
    run = await dropRunOf(db, schedule.day);
  }
  if (schedule.publishDue && run?.computedAt && !run.publishedAt) {
    const published = await publishDrops(db, schedule.day, now);
    log(`drop published to ${published} members`);
  }
}

export const dropTickTask: Task = async (_payload, helpers) => {
  const url = process.env.DATABASE_URL;
  if (!url) {
    return;
  }
  const { db, close } = createDatabase(url, { maxConnections: 4 });
  try {
    await dropTick(db, new Date(), (line) => helpers.logger.info(line));
  } finally {
    await close();
  }
};
