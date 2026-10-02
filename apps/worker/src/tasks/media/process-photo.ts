import type { Database } from "@epilove/db";
import { findPhoto, markPhotoFailed, markPhotoProcessed } from "@epilove/db/repositories/profiles";
import { photoKey, quarantineKey } from "@epilove/media";
import { processPhoto } from "@epilove/media/processing";
import type { Storage } from "@epilove/media/storage";
import type { Task } from "graphile-worker";
import { z } from "zod";

const payloadSchema = z.object({ photoId: z.uuid() });

export interface MediaDependencies {
  readonly database: () => Database;
  readonly storage: () => Storage;
}

/**
 * Re-encodes an uploaded photo (docs/04-architecture.md, section 4.4): real
 * type checked by decoding, EXIF dropped, resized, ThumbHash computed. The
 * photo stays `pending` until a moderator approves it (ADM-01).
 * Idempotent: a photo that is no longer `processing` is left alone.
 */
export function processPhotoTask({ database, storage }: MediaDependencies): Task {
  return async (rawPayload, helpers) => {
    const { photoId } = payloadSchema.parse(rawPayload);
    const db = database();
    const photo = await findPhoto(db, photoId);
    if (photo?.stage !== "processing") {
      return;
    }
    const source = quarantineKey(photo.userId, photo.id);
    const store = storage();
    if (!(await store.head(source))) {
      // The original is gone (purged, or never uploaded): retrying cannot help.
      await markPhotoFailed(db, photo.id, "missing");
      return;
    }
    const original = await store.read(source);
    const result = await processPhoto(original);

    if (!result.ok) {
      await markPhotoFailed(db, photo.id, result.reason);
      await store.remove(source);
      helpers.logger.info(`photo rejected by processing: ${result.reason}`);
      return;
    }

    const target = photoKey(photo.userId, photo.id);
    await store.write(target, result.bytes, "image/webp");
    await markPhotoProcessed(db, photo.id, {
      storageKey: target,
      width: result.width,
      height: result.height,
      thumbhash: result.thumbhash,
    });
    await store.remove(source);
  };
}
