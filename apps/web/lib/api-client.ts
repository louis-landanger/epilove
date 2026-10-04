"use client";

import { type ApiClient, createApiClient } from "@atomes/contracts/client";
import { createTanstackQueryUtils } from "@orpc/tanstack-query";

/**
 * Typed client of the same-origin API, for the browser. The session cookie
 * (or, in development, the cookie of the member chosen on /dev) goes along.
 */
export const api: ApiClient = createApiClient({
  url: typeof window === "undefined" ? "http://localhost/api/rpc" : `${window.location.origin}/api/rpc`,
});

/** TanStack Query helpers: `orpc.discovery.deck.queryOptions({ input })`… */
export const orpc = createTanstackQueryUtils(api);

/** The typed error code of an API error (`INVALID_VALUE`, `UNDERAGE`…), if any. */
export function errorCode(error: unknown): string | null {
  if (typeof error === "object" && error !== null && "code" in error && typeof error.code === "string") {
    return error.code;
  }
  return null;
}

/** The `data` payload of a typed API error. */
export function errorData<T>(error: unknown): T | null {
  if (typeof error === "object" && error !== null && "data" in error) {
    return (error.data as T) ?? null;
  }
  return null;
}
