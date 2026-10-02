import "server-only";

/**
 * Per-IP token bucket kept in memory, per server process.
 * TODO(ONB-01): move to Valkey (shared between instances, survives restarts).
 *
 * Generous on purpose: a whole lecture hall behind the campus NAT may sign up
 * from the same address within minutes after a QR code is shown.
 */
const CAPACITY = 60;
const REFILL_PER_MS = CAPACITY / (10 * 60_000);
const MAX_KEYS = 20_000;

const buckets = new Map<string, { tokens: number; updatedAt: number }>();

export function takeToken(key: string, now: number = Date.now()): boolean {
  const bucket = buckets.get(key) ?? { tokens: CAPACITY, updatedAt: now };
  bucket.tokens = Math.min(CAPACITY, bucket.tokens + (now - bucket.updatedAt) * REFILL_PER_MS);
  bucket.updatedAt = now;
  if (buckets.size >= MAX_KEYS && !buckets.has(key)) {
    // Full buckets carry no information: forget them first.
    for (const [candidate, value] of buckets) {
      if (value.tokens + (now - value.updatedAt) * REFILL_PER_MS >= CAPACITY) {
        buckets.delete(candidate);
      }
    }
  }
  if (bucket.tokens < 1) {
    buckets.set(key, bucket);
    return false;
  }
  bucket.tokens -= 1;
  buckets.set(key, bucket);
  return true;
}

/**
 * The client address as seen by the edge. Only meaningful behind a proxy that
 * overwrites these headers (Cloudflare in production, docs/03-stack.md).
 */
export function clientAddress(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return headers.get("cf-connecting-ip") ?? headers.get("x-real-ip") ?? forwarded ?? "unknown";
}
