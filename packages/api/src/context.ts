import type { Database, Role } from "@epilove/db";

/** The authenticated member behind a request. */
export interface Viewer {
  readonly userId: string;
  readonly role: Role;
}

export interface ApiContext {
  readonly version: string;
  /** Lazily opened: procedures that do not touch the database never need DATABASE_URL. */
  readonly database: () => Database;
  readonly viewer: Viewer | null;
}

/** Turns a request into a viewer (session cookie, or the development resolver). */
export type ViewerResolver = (request: Request) => Promise<Viewer | null>;

export const anonymous: ViewerResolver = async () => null;

const DEV_USER_HEADER = "x-dev-user-id";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * Development-only resolver: trusts an `x-dev-user-id` header. Allowed only when
 * APP_ENV is explicitly `development` or `test` (an unset APP_ENV counts as
 * production), so it can never be switched on by accident in production.
 * Replaced by the Better Auth session resolver (session A); kept for local
 * development, seeds and end-to-end tests.
 */
export function devHeaderResolver(env: Record<string, string | undefined> = process.env): ViewerResolver {
  if (env.APP_ENV !== "development" && env.APP_ENV !== "test") {
    throw new Error("The development viewer resolver requires APP_ENV=development or APP_ENV=test.");
  }
  return async (request) => {
    const userId = request.headers.get(DEV_USER_HEADER);
    if (!userId || !UUID_PATTERN.test(userId)) {
      return null;
    }
    const role = request.headers.get("x-dev-user-role");
    return { userId, role: role === "moderator" || role === "admin" ? role : "user" };
  };
}
