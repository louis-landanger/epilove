import "server-only";
import {
  type AppDependencies,
  anonymous,
  createApp,
  createServerClient,
  defaultServices,
  devHeaderResolver,
  type Role,
  type ViewerResolver,
} from "@atomes/api";
import { revokeAllSessions } from "@atomes/auth";
import { createValkeyRateLimiter, valkeyFromEnv } from "@atomes/rate-limit";
import { getAuth } from "./auth";
import { getDatabase } from "./database";
import { getCurrentMember } from "./session";

/** Resolves the signed-in member from the Better Auth session cookie. */
const sessionResolver: ViewerResolver = async (request) => {
  const session = await getAuth().api.getSession({ headers: request.headers });
  if (!session) {
    return null;
  }
  return { userId: session.user.id, role: (session.user.role ?? "user") as Role };
};

/**
 * Session first; in development and tests (DEV_AUTH=1 and APP_ENV=development
 * or test), the `x-dev-user-id` header or `atomes_dev_user` cookie as a fallback.
 */
function viewerResolver(): ViewerResolver {
  if (process.env.DEV_AUTH !== "1") {
    return sessionResolver;
  }
  const dev = devHeaderResolver();
  return async (request) => (await sessionResolver(request)) ?? (await dev(request)) ?? anonymous(request);
}

const defaults = defaultServices();

/** Shared by every request of this process; Valkey keeps limits across instances and restarts. */
export const rateLimiter = process.env.VALKEY_URL
  ? createValkeyRateLimiter(valkeyFromEnv())
  : defaults.limiter;

const dependencies: Omit<AppDependencies, "resolveViewer"> = {
  version: process.env.APP_VERSION ?? "dev",
  database: getDatabase,
  trackActivity: true,
  services: {
    ...defaults,
    limiter: rateLimiter,
    revokeSessions: (userId) => revokeAllSessions(getAuth(), userId),
  },
};

export const apiApp = createApp({ ...dependencies, resolveViewer: viewerResolver() });

/** The API called in-process by server components, as the signed-in member. */
export async function serverApi() {
  const member = await getCurrentMember();
  return createServerClient(dependencies, member ? { userId: member.userId, role: member.role } : null);
}

/**
 * The API for public pages (landing, waiting list), called in-process without
 * a viewer. It skips the HTTP layer and its per-address ceiling: callers that
 * act for a visitor apply their own per-address limit (see the waiting list).
 */
export const anonymousApi = createServerClient(dependencies, null);
