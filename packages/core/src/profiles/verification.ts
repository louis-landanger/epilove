/**
 * Photo verification by gesture (ONB-08): a selfie reproducing a random
 * gesture, compared by a moderator with the profile photos. No automatic
 * face recognition, so no biometric processing; the selfie is deleted once
 * reviewed.
 */

export const VERIFICATION_GESTURES = [
  "peace",
  "thumbs_up",
  "hand_on_head",
  "three_fingers",
  "point_up",
  "ok_sign",
  "open_palm",
  "hand_on_chin",
] as const;
export type VerificationGesture = (typeof VERIFICATION_GESTURES)[number];

export const VERIFICATION_STATUSES = [
  "uploading",
  "processing",
  "pending",
  "approved",
  "rejected",
  "failed",
] as const;
export type VerificationStatus = (typeof VERIFICATION_STATUSES)[number];

export const VERIFICATION_REJECTIONS = ["gesture_mismatch", "face_mismatch", "unclear", "not_live"] as const;
export type VerificationRejection = (typeof VERIFICATION_REJECTIONS)[number];

/** A gesture is valid this long: the selfie must be taken now, not picked from the gallery. */
export const VERIFICATION_ATTEMPT_TTL_MINUTES = 15;
export const VERIFICATION_ATTEMPTS_PER_DAY = 3;

/** A random gesture, never the one of the previous attempt. */
export function pickGesture(
  random: () => number,
  previous?: VerificationGesture | null,
): VerificationGesture {
  const choices = VERIFICATION_GESTURES.filter((gesture) => gesture !== previous);
  const index = Math.min(Math.floor(random() * choices.length), choices.length - 1);
  return choices[Math.max(index, 0)] ?? VERIFICATION_GESTURES[0];
}

export type VerificationBlocker = "verified" | "no_photo" | "in_review";

/** Why a new attempt cannot start, or `null` when it can. */
export function verificationBlocker(facts: {
  readonly verified: boolean;
  /** Profile photos that a moderator can compare with (ready, not rejected). */
  readonly comparablePhotos: number;
  readonly attemptInReview: boolean;
}): VerificationBlocker | null {
  if (facts.verified) return "verified";
  if (facts.attemptInReview) return "in_review";
  if (facts.comparablePhotos < 1) return "no_photo";
  return null;
}

/** An attempt still waiting for its selfie is usable for a few minutes only. */
export function isAttemptFresh(createdAt: Date, now: Date): boolean {
  const age = now.getTime() - createdAt.getTime();
  return age >= 0 && age <= VERIFICATION_ATTEMPT_TTL_MINUTES * 60_000;
}
