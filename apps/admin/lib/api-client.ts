"use client";

import { type ApiClient, createApiClient } from "@atomes/contracts/client";

let client: ApiClient | undefined;

export function api(): ApiClient {
  client ??= createApiClient({ url: new URL("/api/rpc", window.location.origin).toString() });
  return client;
}

export function errorCode(error: unknown): string | null {
  if (typeof error === "object" && error !== null && "code" in error && typeof error.code === "string") {
    return error.code;
  }
  return null;
}
