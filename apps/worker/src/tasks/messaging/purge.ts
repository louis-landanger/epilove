import { MESSAGING_RULES } from "@epilove/core";
import { createDatabase, type Database } from "@epilove/db";
import {
  dueMediaDeletions,
  forgetMediaDeletion,
  purgeDeletedBodies,
} from "@epilove/db/repositories/messaging";
import { type ObjectStore, objectStoreFromEnv } from "@epilove/db/storage";
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

/** Deletes the stored media whose time has come; a failed deletion is retried on the next run. */
export async function purgeDueMedia(db: Database, store: ObjectStore, now: Date): Promise<number> {
  const due = await dueMediaDeletions(db, now);
  const done: string[] = [];
  for (const { storageKey } of due) {
    try {
      await store.delete(storageKey);
      done.push(storageKey);
    } catch {
      // Retried on the next run.
    }
  }
  await forgetMediaDeletion(db, done);
  return done.length;
}

/**
 * Every few minutes: deletes stored media whose time has come (a view-once
 * photo after its viewing, the media of purged messages).
 */
export const mediaPurge: Task = async (_payload, helpers) => {
  const url = process.env.DATABASE_URL;
  const store = objectStoreFromEnv();
  if (!url || !store) {
    return;
  }
  const { db, close } = createDatabase(url, { maxConnections: 1 });
  try {
    const deleted = await purgeDueMedia(db, store, new Date());
    if (deleted > 0) {
      helpers.logger.info(`media deleted: ${deleted}`);
    }
  } finally {
    await close();
  }
};
