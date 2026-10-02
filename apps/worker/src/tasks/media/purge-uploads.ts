import { deletePhoto, listAbandonedUploads } from "@epilove/db/repositories/profiles";
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
    if (abandoned.length > 0) {
      helpers.logger.info(`purged ${abandoned.length} abandoned uploads`);
    }
  };
}
