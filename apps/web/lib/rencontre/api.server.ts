import "server-only";
import { cookies } from "next/headers";
import { DEV_MEMBER_COOKIE, parseDevMember } from "./dev-member";

/** The API for server components: in-process, as the signed-in member (see `lib/server/api-app`). */
export { serverApi } from "@/lib/server/api-app";

/** Id of the member chosen on /dev, for development pages only. */
export async function currentDevMember(): Promise<string | null> {
  return parseDevMember((await cookies()).get(DEV_MEMBER_COOKIE)?.value);
}
