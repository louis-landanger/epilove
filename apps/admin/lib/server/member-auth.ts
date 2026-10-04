import "server-only";
import { type Auth, authEnvFromProcess, createAuth, valkeySecondaryStorage } from "@atomes/auth";
import { createMailer, mailerConfigFromEnv } from "@atomes/email";
import { createMemoryRateLimiter, valkeyFromEnv } from "@atomes/rate-limit";
import { getDatabase } from "./database";

let auth: Auth | undefined;

/** The member app's auth configuration, only used to end a sanctioned member's sessions. */
export function getMemberAuth(): Auth {
  if (!auth) {
    const env = authEnvFromProcess();
    auth = createAuth({
      env,
      db: getDatabase(),
      mailer: createMailer(mailerConfigFromEnv()),
      limiter: createMemoryRateLimiter(),
      secondaryStorage: env.VALKEY_URL ? valkeySecondaryStorage(valkeyFromEnv()) : undefined,
    });
  }
  return auth;
}
