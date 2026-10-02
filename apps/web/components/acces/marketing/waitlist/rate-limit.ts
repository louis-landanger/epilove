import "server-only";
import { rateLimiter } from "@/lib/server/api-app";

/**
 * Per-address ceiling of the waiting list form, shared by every instance
 * (Valkey). Generous on purpose: a whole lecture hall behind the campus NAT
 * may sign up from the same address within minutes after a QR code is shown.
 */
const PER_ADDRESS = { limit: 60, windowSeconds: 600 } as const;

export async function takeToken(address: string): Promise<boolean> {
  const { allowed } = await rateLimiter.consume(
    `waitlist:ip:${address}`,
    PER_ADDRESS.limit,
    PER_ADDRESS.windowSeconds,
  );
  return allowed;
}

/**
 * The client address as seen by the edge. Only meaningful behind a proxy that
 * overwrites these headers (Cloudflare in production, docs/03-stack.md).
 */
export function clientAddress(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return headers.get("cf-connecting-ip") ?? headers.get("x-real-ip") ?? forwarded ?? "unknown";
}
