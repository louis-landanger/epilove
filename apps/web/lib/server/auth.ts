import "server-only";
import {
  type Auth,
  authEnvFromProcess,
  createAuth,
  forgeIdConfigFromEnv,
  microsoftConfigFromEnv,
  valkeySecondaryStorage,
} from "@epilove/auth";
import { createMailer, mailerConfigFromEnv } from "@epilove/email";
import { createMemoryRateLimiter, createValkeyRateLimiter, valkeyFromEnv } from "@epilove/rate-limit";
import { getDatabase } from "./database";

let auth: Auth | undefined;

/** Better Auth instance, created on first use so builds never need the runtime secrets. */
export function getAuth(): Auth {
  if (!auth) {
    const env = authEnvFromProcess();
    const valkey = env.VALKEY_URL ? valkeyFromEnv() : undefined;
    auth = createAuth({
      env,
      db: getDatabase(),
      mailer: createMailer(mailerConfigFromEnv()),
      limiter: valkey ? createValkeyRateLimiter(valkey) : createMemoryRateLimiter(),
      secondaryStorage: valkey ? valkeySecondaryStorage(valkey) : undefined,
      forgeId: forgeIdConfigFromEnv(),
      microsoft: microsoftConfigFromEnv(),
    });
  }
  return auth;
}
