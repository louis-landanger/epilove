import "server-only";
import {
  type AppDependencies,
  createApp,
  createServerClient,
  defaultServices,
  type Role,
  type ViewerResolver,
} from "@atomes/api";
import { revokeAllSessions } from "@atomes/auth";
import { createValkeyRateLimiter, valkeyFromEnv } from "@atomes/rate-limit";
import { headers } from "next/headers";
import { cache } from "react";
import { getAuth } from "./auth";
import { getDatabase } from "./database";

const viewerFromHeaders = async (requestHeaders: Headers) => {
  const session = await getAuth().api.getSession({ headers: requestHeaders });
  if (!session) {
    return null;
  }
  return { userId: session.user.id, role: (session.user.role ?? "user") as Role };
};

const resolveViewer: ViewerResolver = (request) => viewerFromHeaders(request.headers);

const defaults = defaultServices();

const dependencies: Omit<AppDependencies, "resolveViewer"> = {
  version: process.env.APP_VERSION ?? "dev",
  database: getDatabase,
  services: {
    ...defaults,
    limiter: process.env.VALKEY_URL ? createValkeyRateLimiter(valkeyFromEnv()) : defaults.limiter,
    // Bans end the member's sessions on the app, not only here.
    revokeSessions: async (userId) => {
      const { getMemberAuth } = await import("./member-auth");
      await revokeAllSessions(getMemberAuth(), userId);
    },
  },
};

/** Same API as the app; the `admin` procedures check the staff role. */
export const apiApp = createApp({ ...dependencies, resolveViewer });

/** The signed-in staff member, once per request. */
export const getStaffViewer = cache(async () => viewerFromHeaders(await headers()));

export async function serverApi() {
  return createServerClient(dependencies, await getStaffViewer());
}
