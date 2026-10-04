import type { VerificationGesture, VerificationRejection, VerificationStatus } from "@atomes/core";
import { and, asc, count, desc, eq, gte, inArray, isNotNull, lt, ne, or } from "drizzle-orm";
import type { Database } from "../client";
import { appUser, photo, photoVerification } from "../schema";

type Db = Pick<Database, "select" | "insert" | "update" | "delete">;

/** Photo verification by gesture (ONB-08). */

const columns = {
  id: photoVerification.id,
  userId: photoVerification.userId,
  gesture: photoVerification.gesture,
  status: photoVerification.status,
  storageKey: photoVerification.storageKey,
  rejection: photoVerification.rejection,
  createdAt: photoVerification.createdAt,
  updatedAt: photoVerification.updatedAt,
};

export type VerificationRow = {
  id: string;
  userId: string;
  gesture: VerificationGesture;
  status: VerificationStatus;
  storageKey: string | null;
  rejection: VerificationRejection | null;
  createdAt: Date;
  updatedAt: Date;
};

export async function latestVerification(db: Db, userId: string): Promise<VerificationRow | null> {
  const [row] = await db
    .select(columns)
    .from(photoVerification)
    .where(eq(photoVerification.userId, userId))
    .orderBy(desc(photoVerification.createdAt))
    .limit(1);
  return row ?? null;
}

export async function findVerification(db: Db, id: string): Promise<VerificationRow | null> {
  const [row] = await db.select(columns).from(photoVerification).where(eq(photoVerification.id, id)).limit(1);
  return row ?? null;
}

export async function countAttemptsSince(db: Db, userId: string, since: Date) {
  const [row] = await db
    .select({ value: count() })
    .from(photoVerification)
    .where(and(eq(photoVerification.userId, userId), gte(photoVerification.createdAt, since)));
  return row?.value ?? 0;
}

/** Photos a moderator can compare the selfie with: processed and not refused. */
export async function countComparablePhotos(db: Db, userId: string) {
  const [row] = await db
    .select({ value: count() })
    .from(photo)
    .where(and(eq(photo.userId, userId), eq(photo.stage, "ready"), ne(photo.status, "rejected")));
  return row?.value ?? 0;
}

export async function insertVerification(
  db: Db,
  values: { id: string; userId: string; gesture: VerificationGesture; storageKey: string; createdAt: Date },
) {
  await db.insert(photoVerification).values({ ...values, updatedAt: values.createdAt, status: "uploading" });
}

/** Moves an attempt forward only from the expected status (idempotent jobs and retries). */
export async function advanceVerification(
  db: Db,
  id: string,
  from: VerificationStatus,
  to: VerificationStatus,
  storageKey?: string | null,
) {
  const rows = await db
    .update(photoVerification)
    .set({ status: to, ...(storageKey === undefined ? {} : { storageKey }) })
    .where(and(eq(photoVerification.id, id), eq(photoVerification.status, from)))
    .returning({ id: photoVerification.id });
  return rows.length > 0;
}

export async function listPendingVerifications(db: Db, limit: number) {
  const [rows, [total]] = await Promise.all([
    db
      .select(columns)
      .from(photoVerification)
      .where(and(eq(photoVerification.status, "pending"), isNotNull(photoVerification.storageKey)))
      .orderBy(asc(photoVerification.createdAt))
      .limit(limit),
    db.select({ value: count() }).from(photoVerification).where(eq(photoVerification.status, "pending")),
  ]);
  return { rows: rows as VerificationRow[], total: total?.value ?? 0 };
}

/** Profile photos shown next to the selfie, in profile order. */
export async function listComparablePhotos(db: Db, userId: string) {
  return db
    .select({ id: photo.id, storageKey: photo.storageKey, status: photo.status })
    .from(photo)
    .where(and(eq(photo.userId, userId), eq(photo.stage, "ready"), ne(photo.status, "rejected")))
    .orderBy(asc(photo.position));
}

/**
 * Records the moderator's decision once (the attempt must still be pending)
 * and forgets the selfie. Returns the storage key to delete, or `null` when
 * someone else decided first.
 */
export async function decideVerification(
  db: Db,
  id: string,
  decision: {
    status: "approved" | "rejected";
    rejection: VerificationRejection | null;
    reviewedBy: string;
    at: Date;
  },
): Promise<{ userId: string; storageKey: string | null } | null> {
  const [before] = await db
    .select({ userId: photoVerification.userId, storageKey: photoVerification.storageKey })
    .from(photoVerification)
    .where(and(eq(photoVerification.id, id), eq(photoVerification.status, "pending")))
    .for("update");
  if (!before) {
    return null;
  }
  await db
    .update(photoVerification)
    .set({
      status: decision.status,
      rejection: decision.rejection,
      reviewedBy: decision.reviewedBy,
      reviewedAt: decision.at,
      storageKey: null,
    })
    .where(eq(photoVerification.id, id));
  if (decision.status === "approved") {
    await db.update(appUser).set({ photoVerifiedAt: decision.at }).where(eq(appUser.id, before.userId));
  }
  return before;
}

/** Attempts never completed (no selfie, or failed processing) after `before`. */
export async function listAbandonedVerifications(db: Db, before: Date) {
  return db
    .select({
      id: photoVerification.id,
      userId: photoVerification.userId,
      storageKey: photoVerification.storageKey,
    })
    .from(photoVerification)
    .where(
      and(
        lt(photoVerification.updatedAt, before),
        or(
          inArray(photoVerification.status, ["uploading", "processing"]),
          eq(photoVerification.status, "failed"),
        ),
      ),
    )
    .limit(500);
}

export async function deleteVerification(db: Db, id: string) {
  await db.delete(photoVerification).where(eq(photoVerification.id, id));
}

/** Selfies still stored for a member (account purge). */
export async function listSelfies(db: Db, userId: string) {
  const rows = await db
    .select({ storageKey: photoVerification.storageKey })
    .from(photoVerification)
    .where(and(eq(photoVerification.userId, userId), isNotNull(photoVerification.storageKey)));
  return rows.flatMap((row) => (row.storageKey ? [row.storageKey] : []));
}

export async function photoVerifiedAt(db: Db, userId: string): Promise<Date | null> {
  const [row] = await db
    .select({ at: appUser.photoVerifiedAt })
    .from(appUser)
    .where(eq(appUser.id, userId))
    .limit(1);
  return row?.at ?? null;
}
