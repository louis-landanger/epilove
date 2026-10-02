import type { ApiServices } from "../context";

/**
 * Counts one hit against a per-member quota. Returns false when it is
 * exceeded; the caller turns that into its own typed error.
 */
export async function withinQuota(
  services: ApiServices,
  name: string,
  userId: string,
  limit: number,
  windowSeconds: number,
): Promise<boolean> {
  const result = await services.limiter.consume(`quota:${name}:${userId}`, limit, windowSeconds);
  return result.allowed;
}
