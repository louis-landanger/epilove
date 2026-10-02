import { and, asc, count, eq, inArray, isNotNull, ne, sql } from "drizzle-orm";
import type { Database } from "../client";
import { appUser, interest, photo, profile, profileInterest, prompt, promptAnswer, school } from "../schema";
import type { PhotoStage } from "../schema/profiles";

/** A database handle or an open transaction (drizzle query builder). */
type Db = Pick<Database, "select" | "insert" | "update" | "delete">;

// --- Catalogues (PRO-02, PRO-04) -------------------------------------------

export async function listActivePrompts(db: Db) {
  return db
    .select({
      id: prompt.id,
      slug: prompt.slug,
      category: prompt.category,
      textFr: prompt.textFr,
      textEn: prompt.textEn,
    })
    .from(prompt)
    .where(eq(prompt.active, true))
    .orderBy(asc(prompt.category), asc(prompt.slug));
}

export async function listInterests(db: Db) {
  return db
    .select({
      id: interest.id,
      slug: interest.slug,
      category: interest.category,
      labelFr: interest.labelFr,
      labelEn: interest.labelEn,
    })
    .from(interest)
    .orderBy(asc(interest.category), asc(interest.labelFr));
}

/** How many of `ids` exist in the active prompt catalogue. */
export async function countActivePrompts(db: Db, ids: readonly string[]) {
  if (ids.length === 0) {
    return 0;
  }
  const [row] = await db
    .select({ value: count() })
    .from(prompt)
    .where(and(inArray(prompt.id, [...ids]), eq(prompt.active, true)));
  return row?.value ?? 0;
}

export async function countInterests(db: Db, ids: readonly string[]) {
  if (ids.length === 0) {
    return 0;
  }
  const [row] = await db
    .select({ value: count() })
    .from(interest)
    .where(inArray(interest.id, [...ids]));
  return row?.value ?? 0;
}

// --- Prompt answers and interests -------------------------------------------

export async function listPromptAnswers(db: Db, userId: string) {
  return db
    .select({ promptId: promptAnswer.promptId, text: promptAnswer.text, position: promptAnswer.position })
    .from(promptAnswer)
    .where(eq(promptAnswer.userId, userId))
    .orderBy(asc(promptAnswer.position));
}

/** Replaces all the member's text answers, in the given order. */
export async function replacePromptAnswers(
  db: Db,
  userId: string,
  answers: readonly { promptId: string; text: string }[],
) {
  await db.delete(promptAnswer).where(eq(promptAnswer.userId, userId));
  if (answers.length > 0) {
    await db
      .insert(promptAnswer)
      .values(answers.map((answer, position) => ({ userId, ...answer, position })));
  }
}

export async function listInterestIds(db: Db, userId: string) {
  const rows = await db
    .select({ id: profileInterest.interestId })
    .from(profileInterest)
    .where(eq(profileInterest.userId, userId));
  return rows.map((row) => row.id);
}

export async function replaceInterests(db: Db, userId: string, interestIds: readonly string[]) {
  await db.delete(profileInterest).where(eq(profileInterest.userId, userId));
  if (interestIds.length > 0) {
    await db.insert(profileInterest).values(interestIds.map((interestId) => ({ userId, interestId })));
  }
}

// --- Photos (PRO-01) ----------------------------------------------------------

export const photoColumns = {
  id: photo.id,
  userId: photo.userId,
  storageKey: photo.storageKey,
  position: photo.position,
  width: photo.width,
  height: photo.height,
  thumbhash: photo.thumbhash,
  altText: photo.altText,
  stage: photo.stage,
  status: photo.status,
  createdAt: photo.createdAt,
};

/** The member's photos that still count (not failed, not rejected), in display order. */
export async function listOwnPhotos(db: Db, userId: string) {
  return db
    .select(photoColumns)
    .from(photo)
    .where(and(eq(photo.userId, userId), ne(photo.stage, "failed")))
    .orderBy(asc(photo.position), asc(photo.createdAt));
}

export type PhotoRow = Awaited<ReturnType<typeof listOwnPhotos>>[number];

export async function findOwnPhoto(db: Db, userId: string, photoId: string) {
  const [row] = await db
    .select(photoColumns)
    .from(photo)
    .where(and(eq(photo.id, photoId), eq(photo.userId, userId)))
    .limit(1);
  return row ?? null;
}

export async function findPhoto(db: Db, photoId: string) {
  const [row] = await db.select(photoColumns).from(photo).where(eq(photo.id, photoId)).limit(1);
  return row ?? null;
}

/** Photos that count towards the minimum: uploaded, not failed, not rejected. */
export async function countUsablePhotos(db: Db, userId: string) {
  const [row] = await db
    .select({ value: count() })
    .from(photo)
    .where(
      and(
        eq(photo.userId, userId),
        inArray(photo.stage, ["processing", "ready"]),
        ne(photo.status, "rejected"),
      ),
    );
  return row?.value ?? 0;
}

/** Every photo slot in use, including uploads in progress. */
export async function countPhotoSlots(db: Db, userId: string) {
  const [row] = await db
    .select({ value: count() })
    .from(photo)
    .where(and(eq(photo.userId, userId), ne(photo.stage, "failed")));
  return row?.value ?? 0;
}

export async function insertPhoto(
  db: Db,
  values: { id: string; userId: string; storageKey: string; position: number },
) {
  await db.insert(photo).values({ ...values, stage: "uploading", status: "pending" });
}

export async function setPhotoStage(db: Db, photoId: string, stage: PhotoStage) {
  await db.update(photo).set({ stage }).where(eq(photo.id, photoId));
}

export async function markPhotoProcessed(
  db: Db,
  photoId: string,
  values: { storageKey: string; width: number; height: number; thumbhash: string },
) {
  await db
    .update(photo)
    .set({ ...values, stage: "ready" })
    .where(and(eq(photo.id, photoId), eq(photo.stage, "processing")));
}

export async function markPhotoFailed(db: Db, photoId: string, reason: string) {
  await db
    .update(photo)
    .set({ stage: "failed", moderation: { processing: reason } })
    .where(eq(photo.id, photoId));
}

export async function deletePhoto(db: Db, photoId: string) {
  await db.delete(photo).where(eq(photo.id, photoId));
}

/** Rewrites positions 0..n-1 in the given order. Ids must all belong to `userId`. */
export async function reorderPhotos(db: Db, userId: string, orderedIds: readonly string[]) {
  for (const [position, photoId] of orderedIds.entries()) {
    await db
      .update(photo)
      .set({ position })
      .where(and(eq(photo.id, photoId), eq(photo.userId, userId)));
  }
}

/** Uploads started but never confirmed, older than `olderThan`. */
export async function listAbandonedUploads(db: Db, olderThan: Date) {
  return db
    .select({ id: photo.id, userId: photo.userId, storageKey: photo.storageKey })
    .from(photo)
    .where(and(eq(photo.stage, "uploading"), sql`${photo.createdAt} < ${olderThan.toISOString()}`))
    .limit(500);
}

// --- Own profile (PRO-03, PRO-05) ------------------------------------------------

export async function findOwnProfile(db: Db, userId: string) {
  const [row] = await db
    .select({
      firstName: profile.firstName,
      birthDate: profile.birthDate,
      gender: profile.gender,
      pronouns: profile.pronouns,
      program: profile.program,
      graduationYear: profile.graduationYear,
      languages: profile.languages,
      intentions: profile.intentions,
      anthem: profile.anthem,
      completeness: profile.completeness,
      schoolSlug: school.slug,
    })
    .from(profile)
    .innerJoin(appUser, eq(appUser.id, profile.userId))
    .innerJoin(school, eq(school.id, appUser.schoolId))
    .where(eq(profile.userId, userId))
    .limit(1);
  return row ?? null;
}

export type ProfilePatch = Partial<{
  firstName: string;
  gender: "woman" | "man" | "nonbinary";
  pronouns: string | null;
  program: string | null;
  graduationYear: number;
  languages: string[];
  intentions: string[];
  completeness: number;
}>;

export async function updateProfile(db: Db, userId: string, patch: ProfilePatch) {
  if (Object.keys(patch).length === 0) {
    return;
  }
  await db.update(profile).set(patch).where(eq(profile.userId, userId));
  if (patch.firstName) {
    await db.update(appUser).set({ name: patch.firstName }).where(eq(appUser.id, userId));
  }
}

/** Usable photos that carry a text alternative (PRO-11). */
export async function countPhotosWithAltText(db: Db, userId: string) {
  const [row] = await db
    .select({ value: count() })
    .from(photo)
    .where(
      and(
        eq(photo.userId, userId),
        inArray(photo.stage, ["processing", "ready"]),
        ne(photo.status, "rejected"),
        isNotNull(photo.altText),
      ),
    );
  return row?.value ?? 0;
}

export async function setPhotoAltText(db: Db, userId: string, photoId: string, altText: string | null) {
  await db
    .update(photo)
    .set({ altText })
    .where(and(eq(photo.id, photoId), eq(photo.userId, userId)));
}
