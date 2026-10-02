import { VERIFICATION_GESTURES, VERIFICATION_REJECTIONS, VERIFICATION_STATUSES } from "@epilove/core";
import { MAX_UPLOAD_BYTES, UPLOAD_CONTENT_TYPES } from "@epilove/media";
import { oc } from "@orpc/contract";
import { z } from "zod";

const attempt = z.object({
  id: z.uuid(),
  gesture: z.enum(VERIFICATION_GESTURES),
  status: z.enum(VERIFICATION_STATUSES),
  rejection: z.enum(VERIFICATION_REJECTIONS).nullable(),
  createdAt: z.iso.datetime(),
  /** While `uploading`: until when the gesture can still be photographed. */
  expiresAt: z.iso.datetime(),
});

export const verificationState = z.object({
  verifiedAt: z.iso.datetime().nullable(),
  latest: attempt.nullable(),
  /** Why a new attempt cannot start (`null`: it can). */
  blocker: z.enum(["verified", "no_photo", "in_review", "quota"]).nullable(),
});
export type VerificationState = z.infer<typeof verificationState>;

/**
 * Photo verification by gesture (ONB-08): the member receives a random
 * gesture, takes a selfie reproducing it, and a moderator compares it with
 * the profile photos. The selfie is deleted once reviewed.
 */
export const verificationContract = {
  state: oc.output(verificationState),
  /** Draws a gesture to reproduce within 15 minutes. */
  start: oc
    .errors({
      ALREADY_VERIFIED: { status: 409 },
      IN_REVIEW: { status: 409 },
      NO_PHOTO: { status: 409 },
      RATE_LIMITED: { status: 429 },
    })
    .output(attempt),
  /** Presigned upload form for the selfie of a fresh attempt. */
  requestUpload: oc
    .errors({ NOT_FOUND: { status: 404 }, EXPIRED: { status: 410 } })
    .input(
      z.object({
        id: z.uuid(),
        contentType: z.enum(UPLOAD_CONTENT_TYPES),
        size: z.int().min(1).max(MAX_UPLOAD_BYTES),
      }),
    )
    .output(
      z.object({
        url: z.url(),
        fields: z.record(z.string(), z.string()),
        maxBytes: z.int(),
        expiresAt: z.iso.datetime(),
      }),
    ),
  /** The selfie is uploaded: it is re-encoded, then queued for review. */
  submit: oc
    .errors({ NOT_FOUND: { status: 404 }, UPLOAD_MISSING: { status: 409 }, EXPIRED: { status: 410 } })
    .input(z.object({ id: z.uuid() }))
    .output(verificationState),
};
