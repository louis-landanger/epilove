import { createDatabase } from "@epilove/db";
import { purgePublished } from "@epilove/db/repositories/outbox";
import type { Task } from "graphile-worker";

/** Daily retention of the outbox: published events older than a day are deleted. */
export const outboxPurge: Task = async (_payload, helpers) => {
  const url = process.env.DATABASE_URL;
  if (!url) {
    return;
  }
  const { db, close } = createDatabase(url, { maxConnections: 1 });
  try {
    await purgePublished(db, new Date(Date.now() - 86_400_000));
    helpers.logger.info("outbox purged");
  } finally {
    await close();
  }
};
