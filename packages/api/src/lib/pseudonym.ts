import { createHmac } from "node:crypto";

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/**
 * Stable pseudonym shown to moderators instead of a name (docs/07, A5):
 * "M-7KQ2XA". Derived with a secret, so it cannot be traced back without it.
 */
export function pseudonymOf(secret: string, userId: string): string {
  const digest = createHmac("sha256", secret).update(`pseudonym:${userId}`).digest();
  let value = "";
  for (let index = 0; index < 6; index += 1) {
    value += ALPHABET[(digest[index] ?? 0) % ALPHABET.length];
  }
  return `M-${value}`;
}
