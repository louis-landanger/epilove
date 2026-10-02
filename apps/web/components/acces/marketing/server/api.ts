import "server-only";
import type { WaitlistStats } from "@epilove/contracts";
import { anonymousApi } from "@/lib/server/api-app";

/** In-process API for the public pages: same validation and procedures as /api/rpc. */
export const serverApi = anonymousApi;

/** Waiting list statistics for the first render, or null if the database is unreachable (build, outage). */
export async function initialWaitlistStats(): Promise<WaitlistStats | null> {
  try {
    return await serverApi.waitlist.stats();
  } catch {
    return null;
  }
}
