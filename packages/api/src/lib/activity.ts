import { touchLastActive } from "@epilove/db/repositories/accounts";
import type { ApiContext } from "../context";

/** Activity is recorded at most once per quarter of an hour and per member. */
export const ACTIVITY_RESOLUTION_SECONDS = 900;

/**
 * Marks the signed-in member as active (retention and "active this week"
 * indicators, ADM-09). Throttled in Valkey so most requests cost no write;
 * never fails the request it accompanies.
 */
export async function recordActivity(context: Pick<ApiContext, "viewer" | "services" | "database">) {
  if (!context.viewer) {
    return;
  }
  try {
    const { allowed } = await context.services.limiter.consume(
      `active:${context.viewer.userId}`,
      1,
      ACTIVITY_RESOLUTION_SECONDS,
    );
    if (allowed) {
      await touchLastActive(context.database(), context.viewer.userId, context.services.now());
    }
  } catch {
    console.error("[activity] last activity could not be recorded");
  }
}
