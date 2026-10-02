import "server-only";
import { createApiClient } from "@epilove/contracts/client";
import { cookies, headers } from "next/headers";
import { apiApp } from "@/lib/server/api-app";
import { DEV_MEMBER_COOKIE, DEV_MEMBER_HEADER, parseDevMember } from "./dev-member";

/**
 * API client for server components: calls the API in-process (no network hop)
 * with the visitor's cookies, so the same authentication and access policies
 * apply as for browser calls.
 */
export async function serverApi() {
  const incoming = await headers();
  const jar = await cookies();
  const devMember = parseDevMember(jar.get(DEV_MEMBER_COOKIE)?.value);
  return createApiClient({
    url: "http://internal/api/rpc",
    fetch: (request) => {
      const cookie = incoming.get("cookie");
      if (cookie) {
        request.headers.set("cookie", cookie);
      }
      if (devMember) {
        request.headers.set(DEV_MEMBER_HEADER, devMember);
      }
      return Promise.resolve(apiApp.fetch(request));
    },
  });
}

/** Id of the member chosen on /dev, for development pages only. */
export async function currentDevMember(): Promise<string | null> {
  return parseDevMember((await cookies()).get(DEV_MEMBER_COOKIE)?.value);
}
