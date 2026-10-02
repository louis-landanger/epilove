import { advanceVerification, findVerification } from "@epilove/db/repositories/profiles-verification";
import { quarantineKey, selfieKey } from "@epilove/media";
import { processPhoto } from "@epilove/media/processing";
import type { Task } from "graphile-worker";
import { z } from "zod";
import type { MediaDependencies } from "./process-photo";

const payloadSchema = z.object({ verificationId: z.uuid() });

/**
 * Re-encodes a verification selfie (ONB-08) like a profile photo (real type,
 * EXIF and location dropped), stores it privately and queues it for review.
 * Idempotent: an attempt that is no longer `processing` is left alone.
 */
export function processSelfieTask({ database, storage }: MediaDependencies): Task {
  return async (rawPayload, helpers) => {
    const { verificationId } = payloadSchema.parse(rawPayload);
    const db = database();
    const attempt = await findVerification(db, verificationId);
    if (attempt?.status !== "processing") {
      return;
    }
    const source = quarantineKey(attempt.userId, attempt.id);
    const store = storage();
    if (!(await store.head(source))) {
      await advanceVerification(db, attempt.id, "processing", "failed", null);
      return;
    }
    const result = await processPhoto(await store.read(source));
    if (!result.ok) {
      await advanceVerification(db, attempt.id, "processing", "failed", null);
      await store.remove(source);
      helpers.logger.info(`selfie rejected by processing: ${result.reason}`);
      return;
    }
    const target = selfieKey(attempt.userId, attempt.id);
    await store.write(target, result.bytes, "image/webp");
    await advanceVerification(db, attempt.id, "processing", "pending", target);
    await store.remove(source);
  };
}
