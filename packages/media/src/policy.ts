/**
 * Upload rules shared by the browser, the API and the worker. Pure constants
 * and helpers: safe to import from client components.
 */

/** Formats accepted from the browser (it converts anything else, HEIC included, to JPEG). */
export const UPLOAD_CONTENT_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export type UploadContentType = (typeof UPLOAD_CONTENT_TYPES)[number];

/** The browser compresses before uploading; this is a hard ceiling, enforced by the storage policy. */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

/** Longest side of the published photo, in pixels. */
export const PHOTO_MAX_EDGE = 2048;

/** Smallest acceptable side: below this, a photo is too blurry to be useful. */
export const PHOTO_MIN_EDGE = 320;

const ID = /^[0-9a-f-]{36}$/;

function assertId(value: string) {
  if (!ID.test(value)) {
    throw new Error("Invalid identifier.");
  }
}

/** Where the browser uploads the original, before any processing. */
export function quarantineKey(userId: string, photoId: string): string {
  assertId(userId);
  assertId(photoId);
  return `quarantine/${userId}/${photoId}`;
}

/** The published, re-encoded photo served through imgproxy. */
export function photoKey(userId: string, photoId: string): string {
  assertId(userId);
  assertId(photoId);
  return `photos/${userId}/${photoId}.webp`;
}

/** The re-encoded verification selfie (ONB-08): private, deleted once reviewed. */
export function selfieKey(userId: string, verificationId: string): string {
  assertId(userId);
  assertId(verificationId);
  return `verifications/${userId}/${verificationId}.webp`;
}
