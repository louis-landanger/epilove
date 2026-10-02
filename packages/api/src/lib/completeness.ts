import { type Completeness, profileCompleteness } from "@epilove/core";
import type { Database } from "@epilove/db";
import {
  countPhotosWithAltText,
  countUsablePhotos,
  findOwnProfile,
  listInterestIds,
  listPromptAnswers,
  updateProfile,
} from "@epilove/db/repositories/profiles";
import { photoVerifiedAt } from "@epilove/db/repositories/profiles-verification";

type Db = Pick<Database, "select" | "insert" | "update" | "delete">;

/**
 * Recomputes the completeness gauge (PRO-05) from the stored content and
 * saves it on the profile. Returns `null` when the member has no profile yet.
 */
export async function refreshCompleteness(db: Db, userId: string): Promise<Completeness | null> {
  const profile = await findOwnProfile(db, userId);
  if (!profile) {
    return null;
  }
  const [photos, photosWithAltText, answers, interests, verifiedAt] = await Promise.all([
    countUsablePhotos(db, userId),
    countPhotosWithAltText(db, userId),
    listPromptAnswers(db, userId),
    listInterestIds(db, userId),
    photoVerifiedAt(db, userId),
  ]);
  const completeness = profileCompleteness({
    photos,
    photosWithAltText,
    promptAnswers: answers.length,
    interests: interests.length,
    hasProgram: Boolean(profile.program),
    languages: profile.languages.length,
    hasAnthem: profile.anthem !== null,
    photoVerified: verifiedAt !== null,
  });
  if (completeness.score !== profile.completeness) {
    await updateProfile(db, userId, { completeness: completeness.score });
  }
  return completeness;
}
