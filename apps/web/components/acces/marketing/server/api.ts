import "server-only";
import type { WaitlistStats } from "@epilove/contracts";
import { createApiClient } from "@epilove/contracts/client";
import { apiApp } from "@/lib/server/api-app";

/**
 * Typed client calling the API in-process: same validation, limits and code
 * path as a browser request to /api/rpc, without a network round trip.
 */
export const serverApi = createApiClient({
  url: "http://internal/api/rpc",
  fetch: (request) => Promise.resolve(apiApp.fetch(request)),
});

/** Waiting list statistics for the first render, or null if the database is unreachable (build, outage). */
export async function initialWaitlistStats(): Promise<WaitlistStats | null> {
  try {
    return await serverApi.waitlist.stats();
  } catch {
    return null;
  }
}
