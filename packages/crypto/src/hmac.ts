import { createHmac } from "node:crypto";

/**
 * HMAC-SHA256 of a canonical school email (see `parseSchoolEmail` in
 * @atomes/core). Lets the app compare addresses (hidden contacts, secret
 * crushes, waiting list) without storing them. The secret lives in
 * EMAIL_HMAC_SECRET and must never change once data exists.
 */
export function emailHmac(secret: string, canonicalEmail: string): string {
  if (secret.length < 32) {
    throw new Error("EMAIL_HMAC_SECRET must be at least 32 characters.");
  }
  return createHmac("sha256", secret).update(canonicalEmail).digest("hex");
}
