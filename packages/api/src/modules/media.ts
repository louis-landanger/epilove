import type { OwnPhoto } from "@epilove/contracts";
import { canViewPhoto, MAX_PHOTOS, MIN_PHOTOS, uuidv7 } from "@epilove/core";
import { type Database, enqueueJob } from "@epilove/db";
import { findAccount } from "@epilove/db/repositories/accounts";
import {
  countPhotoSlots,
  countUsablePhotos,
  deletePhoto,
  findOwnPhoto,
  insertPhoto,
  listOwnPhotos,
  type PhotoRow,
  reorderPhotos,
  setPhotoStage,
} from "@epilove/db/repositories/profiles";
import { type ImgproxyConfig, photoUrl, quarantineKey } from "@epilove/media";
import { sql } from "drizzle-orm";
import { withinQuota } from "../lib/quota";
import { os, requireViewer } from "../procedures";

export const PROCESS_PHOTO_TASK = "media/process-photo";

/** Size of the URLs handed to the owner's editor (portrait 4:5). */
const OWN_PHOTO_SIZE = { width: 720, height: 900 } as const;

function toOwnPhoto(viewerId: string, row: PhotoRow, imgproxy: () => ImgproxyConfig): OwnPhoto {
  const visible = canViewPhoto(viewerId, { ownerId: row.userId, stage: row.stage, status: row.status });
  return {
    id: row.id,
    position: row.position,
    stage: row.stage,
    status: row.status,
    width: row.width,
    height: row.height,
    thumbhash: row.thumbhash,
    altText: row.altText,
    url: visible ? photoUrl(imgproxy(), row.storageKey, OWN_PHOTO_SIZE) : null,
  };
}

async function ownPhotos(db: Database, viewerId: string, imgproxy: () => ImgproxyConfig) {
  const rows = await listOwnPhotos(db, viewerId);
  return { photos: rows.map((row) => toOwnPhoto(viewerId, row, imgproxy)) };
}

/** Serialises photo-slot changes of one member (two tabs uploading at once). */
async function lockMember(tx: Pick<Database, "execute">, userId: string) {
  await tx.execute(sql`select 1 from app_user where id = ${userId} for update`);
}

/** The member's own photos (PRO-01). */
export const media = {
  list: os.media.list.use(requireViewer).handler(async ({ context }) => {
    return ownPhotos(context.database(), context.viewer.userId, context.services.imgproxy);
  }),

  requestUpload: os.media.requestUpload.use(requireViewer).handler(async ({ context, input, errors }) => {
    const { userId } = context.viewer;
    if (!(await withinQuota(context.services, "photo-upload", userId, 30, 3600))) {
      throw errors.RATE_LIMITED();
    }
    const db = context.database();
    const photoId = uuidv7();
    const key = quarantineKey(userId, photoId);
    await db.transaction(async (tx) => {
      await lockMember(tx, userId);
      const slots = await countPhotoSlots(tx, userId);
      if (slots >= MAX_PHOTOS) {
        throw errors.TOO_MANY_PHOTOS();
      }
      await insertPhoto(tx, { id: photoId, userId, storageKey: key, position: slots });
    });
    const upload = await context.services
      .storage()
      .presignUpload(key, input.contentType, context.services.now());
    return { photoId, upload };
  }),

  confirmUpload: os.media.confirmUpload.use(requireViewer).handler(async ({ context, input, errors }) => {
    const { userId } = context.viewer;
    const db = context.database();
    const photo = await findOwnPhoto(db, userId, input.photoId);
    if (!photo) {
      throw errors.NOT_FOUND();
    }
    if (photo.stage === "uploading") {
      const stored = await context.services.storage().head(photo.storageKey);
      if (!stored) {
        throw errors.UPLOAD_MISSING();
      }
      await db.transaction(async (tx) => {
        await setPhotoStage(tx, photo.id, "processing");
        await enqueueJob(tx, PROCESS_PHOTO_TASK, { photoId: photo.id }, { jobKey: `photo:${photo.id}` });
      });
    }
    const current = await findOwnPhoto(db, userId, input.photoId);
    if (!current) {
      throw errors.NOT_FOUND();
    }
    return toOwnPhoto(userId, current, context.services.imgproxy);
  }),

  reorder: os.media.reorder.use(requireViewer).handler(async ({ context, input, errors }) => {
    const { userId } = context.viewer;
    const db = context.database();
    await db.transaction(async (tx) => {
      await lockMember(tx, userId);
      const current = await listOwnPhotos(tx, userId);
      const expected = new Set(current.map((photo) => photo.id));
      const given = new Set(input.photoIds);
      if (
        given.size !== input.photoIds.length ||
        given.size !== expected.size ||
        input.photoIds.some((id) => !expected.has(id))
      ) {
        throw errors.INVALID_ORDER();
      }
      await reorderPhotos(tx, userId, input.photoIds);
    });
    return ownPhotos(db, userId, context.services.imgproxy);
  }),

  remove: os.media.remove.use(requireViewer).handler(async ({ context, input, errors }) => {
    const { userId } = context.viewer;
    const db = context.database();
    const removed = await db.transaction(async (tx) => {
      await lockMember(tx, userId);
      const photo = await findOwnPhoto(tx, userId, input.photoId);
      if (!photo) {
        throw errors.NOT_FOUND();
      }
      const account = await findAccount(tx, userId);
      const counts = (photo.stage === "processing" || photo.stage === "ready") && photo.status !== "rejected";
      // An active profile keeps at least two photos (PRO-01); onboarding can start over freely.
      if (account?.status !== "onboarding" && counts && (await countUsablePhotos(tx, userId)) <= MIN_PHOTOS) {
        throw errors.MIN_PHOTOS();
      }
      await deletePhoto(tx, photo.id);
      const remaining = await listOwnPhotos(tx, userId);
      await reorderPhotos(
        tx,
        userId,
        remaining.map((row) => row.id),
      );
      return photo;
    });
    // Objects are removed after the commit; a failure leaves an orphan for the purge job.
    const storage = context.services.storage();
    await Promise.all(
      [removed.storageKey, quarantineKey(userId, removed.id)].map((key) =>
        storage.remove(key).catch(() => {
          console.error("[media] object removal failed, left for the purge job");
        }),
      ),
    );
    return ownPhotos(db, userId, context.services.imgproxy);
  }),
};
