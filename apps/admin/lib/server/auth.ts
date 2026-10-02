import "server-only";
import { type Auth, authEnvFromProcess, createAuth, valkeySecondaryStorage } from "@epilove/auth";
import { createMailer, mailerConfigFromEnv } from "@epilove/email";
import { createMemoryRateLimiter, createValkeyRateLimiter, valkeyFromEnv } from "@epilove/rate-limit";
import { getDatabase } from "./database";

export const ADMIN_COOKIE_PREFIX = "epilove-staff";

let auth: Auth | undefined;

/**
 * The back-office has its own sessions (own cookie, 8 hours, no sign-up):
 * a member session on the app never opens the back-office.
 */
export function getAuth(): Auth {
  if (!auth) {
    const env = authEnvFromProcess({
      ...process.env,
      APP_URL: process.env.ADMIN_URL ?? "http://localhost:3001",
    });
    const valkey = env.VALKEY_URL ? valkeyFromEnv() : undefined;
    auth = createAuth({
      env,
      db: getDatabase(),
      mailer: createMailer(mailerConfigFromEnv()),
      limiter: valkey ? createValkeyRateLimiter(valkey) : createMemoryRateLimiter(),
      secondaryStorage: valkey ? valkeySecondaryStorage(valkey) : undefined,
      options: { allowSignUp: false, sessionExpiresInSeconds: 8 * 3600, cookiePrefix: ADMIN_COOKIE_PREFIX },
    });
  }
  return auth;
}
