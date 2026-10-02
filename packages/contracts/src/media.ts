import { MAX_PHOTOS, PHOTO_ALT_TEXT_MAX_LENGTH } from "@epilove/core";
import { MAX_UPLOAD_BYTES, UPLOAD_CONTENT_TYPES } from "@epilove/media/policy";
import { oc } from "@orpc/contract";
import { z } from "zod";

export const ownPhoto = z.object({
  id: z.uuid(),
  position: z.int(),
  stage: z.enum(["uploading", "processing", "ready", "failed"]),
  /** Moderation status: only approved photos are shown to other members. */
  status: z.enum(["pending", "approved", "rejected"]),
  width: z.int().nullable(),
  height: z.int().nullable(),
  thumbhash: z.string().nullable(),
  altText: z.string().nullable(),
  /** Signed, expiring URL; `null` until the photo is processed. */
  url: z.string().nullable(),
});
export type OwnPhoto = z.infer<typeof ownPhoto>;

const photos = z.object({ photos: z.array(ownPhoto) });

/**
 * The member's own photos (PRO-01). Uploads go straight from the browser to
 * object storage through a presigned form limited in size, type and time.
 */
export const mediaContract = {
  list: oc.output(photos),
  /** Reserves a slot and returns the presigned upload form. */
  requestUpload: oc
    .errors({ TOO_MANY_PHOTOS: { status: 409 }, RATE_LIMITED: { status: 429 } })
    .input(
      z.object({
        contentType: z.enum(UPLOAD_CONTENT_TYPES),
        size: z.int().min(1).max(MAX_UPLOAD_BYTES),
      }),
    )
    .output(
      z.object({
        photoId: z.uuid(),
        upload: z.object({
          url: z.url(),
          fields: z.record(z.string(), z.string()),
          maxBytes: z.int(),
          expiresAt: z.iso.datetime(),
        }),
      }),
    ),
  /** Called once the browser upload succeeded: queues the processing job. */
  confirmUpload: oc
    .errors({ UPLOAD_MISSING: { status: 409 }, NOT_FOUND: { status: 404 } })
    .input(z.object({ photoId: z.uuid() }))
    .output(ownPhoto),
  reorder: oc
    .errors({ INVALID_ORDER: { status: 422 } })
    .input(z.object({ photoIds: z.array(z.uuid()).min(1).max(MAX_PHOTOS) }))
    .output(photos),
  /** Text alternative read by screen readers (PRO-11). */
  setAltText: oc
    .errors({ NOT_FOUND: { status: 404 } })
    .input(z.object({ photoId: z.uuid(), altText: z.string().max(PHOTO_ALT_TEXT_MAX_LENGTH).nullable() }))
    .output(ownPhoto),
  remove: oc
    .errors({ NOT_FOUND: { status: 404 }, MIN_PHOTOS: { status: 409 } })
    .input(z.object({ photoId: z.uuid() }))
    .output(photos),
};
