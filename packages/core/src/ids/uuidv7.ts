/**
 * UUIDv7 (RFC 9562): 48-bit Unix timestamp in milliseconds, then random bits.
 * Time-ordered like PostgreSQL's `uuidv7()`, usable on the server and in the
 * browser (Web Crypto). Message ids are generated client-side with it, which
 * makes sending idempotent.
 */
export function uuidv7(now: number = Date.now(), random?: Uint8Array): string {
  const bytes = new Uint8Array(16);
  if (random) {
    // Given random bytes (seeded data, tests): the id is then deterministic.
    if (random.length < 10) {
      throw new RangeError("uuidv7 needs at least 10 random bytes.");
    }
    bytes.set(random.subarray(0, 10), 6);
  } else {
    crypto.getRandomValues(bytes);
  }
  if (!Number.isFinite(now) || now < 0 || now >= 2 ** 48) {
    throw new RangeError("uuidv7 needs a 48-bit millisecond timestamp.");
  }
  let timestamp = Math.floor(now);
  for (let index = 5; index >= 0; index -= 1) {
    bytes[index] = timestamp & 0xff;
    timestamp = Math.floor(timestamp / 256);
  }
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x70;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Milliseconds encoded in a UUIDv7. */
export function uuidv7Timestamp(id: string): number {
  return Number.parseInt(id.replaceAll("-", "").slice(0, 12), 16);
}
