import type { KeyRing } from "@epilove/crypto";
import type { Database, Role } from "@epilove/db";
import type { Mailer } from "@epilove/email";
import type { ImgproxyConfig } from "@epilove/media";
import type { Storage } from "@epilove/media/storage";
import type { RateLimiter } from "@epilove/rate-limit";

/** The authenticated member behind a request. */
export interface Viewer {
  readonly userId: string;
  readonly role: Role;
}

/**
 * Infrastructure the procedures use besides the database. Factories are lazy
 * so that procedures which do not need a service never require its settings.
 */
export interface ApiServices {
  readonly storage: () => Storage;
  readonly imgproxy: () => ImgproxyConfig;
  /** Quotas on sensitive mutations (CLAUDE.md invariants). */
  readonly limiter: RateLimiter;
  /** Ends every session of a member at once (account deletion, underage declaration). */
  readonly revokeSessions: (userId: string) => Promise<void>;
  /** Secret for email fingerprints (`emailHmac`). */
  readonly emailHmacSecret: () => string;
  /** Keys for application-level encryption (report details, message bodies). */
  readonly keyRing: () => KeyRing;
  /** Transactional emails (moderation decisions, notifications). */
  readonly mailer: () => Mailer;
  /** Public URL of the member app, for links in emails. */
  readonly appUrl: () => string;
  readonly now: () => Date;
}

export interface ApiContext {
  readonly version: string;
  /** Lazily opened: procedures that do not touch the database never need DATABASE_URL. */
  readonly database: () => Database;
  readonly viewer: Viewer | null;
  readonly services: ApiServices;
}

/** Turns a request into a viewer (session cookie, or the development resolver). */
export type ViewerResolver = (request: Request) => Promise<Viewer | null>;

export const anonymous: ViewerResolver = async () => null;

const DEV_USER_HEADER = "x-dev-user-id";
/** Same value as the header, for browsers (set by the development member picker). */
export const DEV_USER_COOKIE = "epilove_dev_user";
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
    const userId =
      request.headers.get(DEV_USER_HEADER) ?? readCookie(request.headers.get("cookie"), DEV_USER_COOKIE);
    if (!userId || !UUID_PATTERN.test(userId)) {
      return null;
    }
    const role = request.headers.get("x-dev-user-role");
    return { userId, role: role === "moderator" || role === "admin" ? role : "user" };
  };
}

function readCookie(header: string | null, name: string): string | null {
  if (!header) {
    return null;
  }
  for (const part of header.split(";")) {
    const [key, ...value] = part.trim().split("=");
    if (key === name) {
      return decodeURIComponent(value.join("="));
    }
  }
  return null;
}
