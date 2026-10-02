import { randomInt } from "node:crypto";
import type { VerificationState } from "@epilove/contracts";
import {
  isAttemptFresh,
  pickGesture,
  uuidv7,
  VERIFICATION_ATTEMPT_TTL_MINUTES,
  VERIFICATION_ATTEMPTS_PER_DAY,
  verificationBlocker,
} from "@epilove/core";
import { type Database, enqueueJob } from "@epilove/db";
import {
  advanceVerification,
  countAttemptsSince,
  countComparablePhotos,
  findVerification,
  insertVerification,
  latestVerification,
  photoVerifiedAt,
  type VerificationRow,
} from "@epilove/db/repositories/profiles-verification";
import { quarantineKey } from "@epilove/media";
import { os, requireViewer } from "../procedures";

export const PROCESS_SELFIE_TASK = "media/process-selfie";

const DAY_MS = 86_400_000;
const TTL_MS = VERIFICATION_ATTEMPT_TTL_MINUTES * 60_000;

function toAttempt(row: VerificationRow) {
  return {
    id: row.id,
    gesture: row.gesture,
    status: row.status,
    rejection: row.rejection,
    createdAt: row.createdAt.toISOString(),
    expiresAt: new Date(row.createdAt.getTime() + TTL_MS).toISOString(),
  };
}

async function state(db: Database, userId: string, now: Date): Promise<VerificationState> {
  const [verifiedAt, latest, photos, attempts] = await Promise.all([
    photoVerifiedAt(db, userId),
    latestVerification(db, userId),
    countComparablePhotos(db, userId),
    countAttemptsSince(db, userId, new Date(now.getTime() - DAY_MS)),
  ]);
  const inReview = latest?.status === "processing" || latest?.status === "pending";
  const blocker =
    verificationBlocker({
      verified: verifiedAt !== null,
      comparablePhotos: photos,
      attemptInReview: inReview,
    }) ?? (attempts >= VERIFICATION_ATTEMPTS_PER_DAY ? "quota" : null);
  return {
    verifiedAt: verifiedAt?.toISOString() ?? null,
    latest: latest ? toAttempt(latest) : null,
    blocker,
  };
}

async function ownAttempt(db: Database, userId: string, id: string) {
  const row = await findVerification(db, id);
  return row?.userId === userId ? row : null;
}

/** Photo verification by gesture (ONB-08), member side. */
export const verification = {
  state: os.verification.state
    .use(requireViewer)
    .handler(({ context }) => state(context.database(), context.viewer.userId, context.services.now())),

  start: os.verification.start.use(requireViewer).handler(async ({ context, errors }) => {
    const db = context.database();
    const { userId } = context.viewer;
    const now = context.services.now();
    const current = await state(db, userId, now);
    switch (current.blocker) {
      case "verified":
        throw errors.ALREADY_VERIFIED();
      case "in_review":
        throw errors.IN_REVIEW();
      case "no_photo":
        throw errors.NO_PHOTO();
      case "quota":
        throw errors.RATE_LIMITED();
    }
    const id = uuidv7();
    const gesture = pickGesture(() => randomInt(1_000_000) / 1_000_000, current.latest?.gesture);
    await insertVerification(db, {
      id,
      userId,
      gesture,
      storageKey: quarantineKey(userId, id),
      createdAt: now,
    });
    const row = await findVerification(db, id);
    if (!row) {
      throw new Error("Verification attempt not saved.");
    }
    return toAttempt(row);
  }),

  requestUpload: os.verification.requestUpload
    .use(requireViewer)
    .handler(async ({ context, input, errors }) => {
      const db = context.database();
      const row = await ownAttempt(db, context.viewer.userId, input.id);
      if (row?.status !== "uploading" || !row.storageKey) {
        throw errors.NOT_FOUND();
      }
      const now = context.services.now();
      if (!isAttemptFresh(row.createdAt, now)) {
        throw errors.EXPIRED();
      }
      return context.services.storage().presignUpload(row.storageKey, input.contentType, now);
    }),

  submit: os.verification.submit.use(requireViewer).handler(async ({ context, input, errors }) => {
    const db = context.database();
    const { userId } = context.viewer;
    const row = await ownAttempt(db, userId, input.id);
    if (!row) {
      throw errors.NOT_FOUND();
    }
    const now = context.services.now();
    if (row.status === "uploading") {
      // A short grace period covers the upload itself.
      if (now.getTime() - row.createdAt.getTime() > TTL_MS + 5 * 60_000) {
        throw errors.EXPIRED();
      }
      if (!row.storageKey || !(await context.services.storage().head(row.storageKey))) {
        throw errors.UPLOAD_MISSING();
      }
      await db.transaction(async (tx) => {
        if (await advanceVerification(tx, row.id, "uploading", "processing")) {
          await enqueueJob(
            tx,
            PROCESS_SELFIE_TASK,
            { verificationId: row.id },
            { jobKey: `selfie:${row.id}` },
          );
        }
      });
    }
    return state(db, userId, now);
  }),
};
