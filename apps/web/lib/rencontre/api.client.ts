"use client";

import { createApiClient } from "@epilove/contracts/client";
import { createTanstackQueryUtils } from "@orpc/tanstack-query";
import { DEV_MEMBER_HEADER, devMemberFromDocument } from "./dev-member";

/**
 * Browser API client (same origin, session cookie sent automatically). In
 * development, the member chosen on /dev is added as a header.
 */
export const api = createApiClient({
  url: typeof window === "undefined" ? "http://localhost/api/rpc" : `${window.location.origin}/api/rpc`,
  fetch: (request) => {
    const devMember = devMemberFromDocument();
    if (devMember) {
      request.headers.set(DEV_MEMBER_HEADER, devMember);
    }
    return fetch(request);
  },
});

/** TanStack Query helpers: `orpc.discovery.deck.queryOptions({ input })`… */
export const orpc = createTanstackQueryUtils(api);
