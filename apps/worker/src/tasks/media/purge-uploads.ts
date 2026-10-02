import {
  clearVoice,
  deletePhoto,
  listAbandonedUploads,
  listAbandonedVoices,
} from "@epilove/db/repositories/profiles";
import {
  deleteVerification,
  listAbandonedVerifications,
} from "@epilove/db/repositories/profiles-verification";
import { quarantineKey } from "@epilove/media";
import type { Task } from "graphile-worker";
import type { MediaDependencies } from "./process-photo";

/** Uploads reserved but never confirmed are dropped after an hour. */
const ABANDONED_AFTER_MS = 60 * 60 * 1000;

export function purgeUploadsTask({ database, storage }: MediaDependencies): Task {
  return async (_payload, helpers) => {
    const db = database();
    const abandoned = await listAbandonedUploads(db, new Date(Date.now() - ABANDONED_AFTER_MS));
    const store = storage();
    for (const upload of abandoned) {
      await store.remove(upload.storageKey);
      await deletePhoto(db, upload.id);
    }
    // Verification attempts never completed: the selfie (if any) never reached a moderator.
    const attempts = await listAbandonedVerifications(db, new Date(Date.now() - ABANDONED_AFTER_MS));
    for (const attempt of attempts) {
      if (attempt.storageKey) {
        await store.remove(attempt.storageKey);
      }
      await store.remove(quarantineKey(attempt.userId, attempt.id));
      await deleteVerification(db, attempt.id);
    }
    // Voice answers never confirmed, or refused by the check: the written answer stays.
    const voices = await listAbandonedVoices(db, new Date(Date.now() - ABANDONED_AFTER_MS));
    for (const voice of voices) {
      if (voice.voiceKey) {
        await store.remove(voice.voiceKey);
      }
      await clearVoice(db, voice.id);
    }
    const total = abandoned.length + attempts.length + voices.length;
    if (total > 0) {
      helpers.logger.info(`purged ${total} abandoned uploads`);
    }
  };
}
