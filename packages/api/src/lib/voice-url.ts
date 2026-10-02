import { createHmac, timingSafeEqual } from "node:crypto";
import type { ApiServices } from "../context";

/** Voice answers are served through short-lived signed URLs (CLAUDE.md: signed, expiring media URLs). */
export const VOICE_URL_TTL_SECONDS = 3600;

function signingKey(services: Pick<ApiServices, "emailHmacSecret">) {
  // Derived key: the root secret never signs URLs directly.
  return createHmac("sha256", services.emailHmacSecret()).update("voice-url/v1").digest();
}

function signature(services: Pick<ApiServices, "emailHmacSecret">, answerId: string, expires: number) {
  return createHmac("sha256", signingKey(services)).update(`${answerId}.${expires}`).digest("base64url");
}

/**
 * Same-origin URL of a voice answer. Hand it out only after the access
 * policies allowed the viewer to see the profile.
 */
export function signVoiceUrl(
  services: Pick<ApiServices, "emailHmacSecret" | "now">,
  answerId: string,
): string {
  const expires = Math.floor(services.now().getTime() / 1000) + VOICE_URL_TTL_SECONDS;
  return `/api/voice/${answerId}?exp=${expires}&sig=${signature(services, answerId, expires)}`;
}

export function isValidVoiceSignature(
  services: Pick<ApiServices, "emailHmacSecret" | "now">,
  answerId: string,
  expiresParam: string | undefined,
  signatureParam: string | undefined,
): boolean {
  const expires = Number(expiresParam);
  if (!Number.isInteger(expires) || expires * 1000 < services.now().getTime() || !signatureParam) {
    return false;
  }
  const expected = Buffer.from(signature(services, answerId, expires));
  const given = Buffer.from(signatureParam);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

/** A single `bytes=start-end` range, as browsers send for media (Safari requires 206 answers). */
export function parseRange(header: string | undefined, size: number): { start: number; end: number } | null {
  const match = header?.match(/^bytes=(\d*)-(\d*)$/);
  if (!match || size === 0) {
    return null;
  }
  const [, from = "", to = ""] = match;
  if (from === "" && to === "") {
    return null;
  }
  if (from === "") {
    const suffix = Math.min(Number(to), size);
    return suffix > 0 ? { start: size - suffix, end: size - 1 } : null;
  }
  const start = Number(from);
  const end = to === "" ? size - 1 : Math.min(Number(to), size - 1);
  return start <= end && start < size ? { start, end } : null;
}
