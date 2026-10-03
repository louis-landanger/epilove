import { eventEndsAt } from "./events";

/**
 * Flash (IRL-04): during an event, each participant shows a code that changes
 * every 30 seconds (as a QR code and as 8 characters to type). Scanning each
 * other's code makes a match, if the access policies allow it.
 */
export const FLASH_RULES = {
  windowSeconds: 30,
  codeLength: 8,
  /** Scans per member and per minute (against guessing codes). */
  scansPerMinute: 20,
  /** Flash opens a little before the start. */
  opensMinutesBefore: 30,
} as const;

/** Crockford base 32: no I, L, O or U, easy to read aloud and to type. */
export const FLASH_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

export function flashWindow(now: Date): number {
  return Math.floor(now.getTime() / (FLASH_RULES.windowSeconds * 1000));
}

/** When the current code stops being shown (it is still accepted one window longer). */
export function flashExpiresAt(now: Date): Date {
  return new Date((flashWindow(now) + 1) * FLASH_RULES.windowSeconds * 1000);
}

/** Flash works during the event, for the members who answered it. */
export function flashOpen(
  event: { readonly status: string; readonly startsAt: Date; readonly endsAt: Date | null },
  answered: boolean,
  now: Date,
): boolean {
  const opens = event.startsAt.getTime() - FLASH_RULES.opensMinutesBefore * 60_000;
  return (
    answered &&
    event.status === "published" &&
    now.getTime() >= opens &&
    now.getTime() < eventEndsAt(event).getTime()
  );
}

/** Upper-cases and drops what people add when typing a code (spaces, dashes), and maps look-alikes. */
export function normalizeFlashCode(input: string): string {
  return input.toUpperCase().replace(/[\s-]/g, "").replace(/[IL]/g, "1").replace(/O/g, "0");
}

/** Encodes bytes in the Flash alphabet (5 bits per character). */
export function toFlashCode(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5 && out.length < FLASH_RULES.codeLength) {
      out += FLASH_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  return out;
}
