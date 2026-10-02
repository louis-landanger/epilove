import { MESSAGING_RULES } from "@epilove/core";
import { createDatabase } from "@epilove/db";
import { purgeDeletedBodies } from "@epilove/db/repositories/messaging";
import type { Task } from "graphile-worker";

/**
 * Daily retention of deleted messages (CHAT-08): their encrypted bodies are
 * kept for moderation, then erased after `deletedRetentionDays`.
 */
export const messagePurge: Task = async (_payload, helpers) => {
  const url = process.env.DATABASE_URL;
  if (!url) {
    return;
  }
  const { db, close } = createDatabase(url, { maxConnections: 1 });
  try {
    const purged = await purgeDeletedBodies(
      db,
      new Date(Date.now() - MESSAGING_RULES.deletedRetentionDays * 86_400_000),
    );
    helpers.logger.info(`deleted messages purged: ${purged}`);
  } finally {
    await close();
  }
};
