import { createHmac } from "node:crypto";
import { flashWindow, toFlashCode } from "@atomes/core";
import { emailFingerprint } from "./email";

/**
 * Flash codes (IRL-04): HMAC of the event, the member and the 30-second
 * window, with a key derived from the server secret. Nothing is stored: a
 * scanned code is checked against the event's participants.
 */
function flashKey(): string {
  return emailFingerprint("flash-code/v1");
}

export function flashCodeFor(eventId: string, userId: string, window: number): string {
  const digest = createHmac("sha256", flashKey()).update(`${eventId}:${userId}:${window}`).digest();
  return toFlashCode(new Uint8Array(digest.subarray(0, 5)));
}

/** The participant whose current or previous code this is, if any. */
export function resolveFlashCode(
  eventId: string,
  code: string,
  participants: readonly string[],
  now: Date,
): string | null {
  const window = flashWindow(now);
  for (const userId of participants) {
    if (
      flashCodeFor(eventId, userId, window) === code ||
      flashCodeFor(eventId, userId, window - 1) === code
    ) {
      return userId;
    }
  }
  return null;
}
