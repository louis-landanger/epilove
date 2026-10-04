import { emailHmac } from "@atomes/crypto";
import { ORPCError } from "@orpc/server";

/**
 * Fingerprint of a canonical school email (HMAC with EMAIL_HMAC_SECRET), the
 * only form in which addresses typed by members are kept or compared
 * (secret crushes, hidden contacts).
 */
let secretOverride: string | undefined;

export function emailFingerprint(canonicalEmail: string): string {
  const secret = secretOverride ?? process.env.EMAIL_HMAC_SECRET;
  if (!secret) {
    throw new ORPCError("SERVICE_UNAVAILABLE", { message: "unavailable" });
  }
  return emailHmac(secret, canonicalEmail);
}

/** Tests use a fixed secret, independent of the local .env. */
export function setEmailHmacSecret(secret: string | undefined) {
  secretOverride = secret;
}
