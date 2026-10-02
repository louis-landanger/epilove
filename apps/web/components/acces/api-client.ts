"use client";

import { type ApiClient, createApiClient } from "@epilove/contracts/client";

let client: ApiClient | undefined;

/** Typed client for the same-origin API, created on first use in the browser. */
export function api(): ApiClient {
  client ??= createApiClient({ url: new URL("/api/rpc", window.location.origin).toString() });
  return client;
}

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
