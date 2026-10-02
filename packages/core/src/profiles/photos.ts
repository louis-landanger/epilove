/** What the photo visibility rule needs to know about a photo. */
export interface PhotoVisibilityFacts {
  readonly ownerId: string;
  readonly stage: "uploading" | "processing" | "ready" | "failed";
  readonly status: "pending" | "approved" | "rejected";
}

/**
 * Can `viewerId` load this photo's image? The owner sees every processed
 * photo, including pending and rejected ones; other members only see
 * approved photos, and only once `canViewProfile` allowed the profile itself.
 */
export function canViewPhoto(viewerId: string, photo: PhotoVisibilityFacts): boolean {
  if (photo.stage !== "ready") {
    return false;
  }
  return photo.ownerId === viewerId || photo.status === "approved";
}
