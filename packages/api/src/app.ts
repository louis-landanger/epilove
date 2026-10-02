import { imgproxyConfigFromEnv } from "@epilove/media";
import { createStorage, type Storage, storageConfigFromEnv } from "@epilove/media/storage";
import { createMemoryRateLimiter } from "@epilove/rate-limit";
import { RPCHandler } from "@orpc/server/fetch";
import { Hono } from "hono";
import type { ApiContext, ApiServices, ViewerResolver } from "./context";
import { router } from "./router";

export const API_BASE_PATH = "/api";
export const RPC_PREFIX = `${API_BASE_PATH}/rpc`;

export interface AppDependencies {
  readonly version: string;
  readonly database: ApiContext["database"];
  readonly resolveViewer: ViewerResolver;
  /** Missing services fall back to environment-based defaults (see `defaultServices`). */
  readonly services?: Partial<ApiServices>;
}

/** Services built from environment variables, created on first use. */
export function defaultServices(env: Record<string, string | undefined> = process.env): ApiServices {
  let storage: Storage | undefined;
  return {
    storage: () => {
      const local = env.APP_ENV === "development" || env.APP_ENV === "test";
      storage ??= createStorage(storageConfigFromEnv(env), {
        autoCreateBucketFor: local && env.APP_URL ? [env.APP_URL] : undefined,
      });
      return storage;
    },
    imgproxy: () => imgproxyConfigFromEnv(env),
    limiter: createMemoryRateLimiter(),
    revokeSessions: async () => {
      throw new Error("revokeSessions is not configured.");
    },
    emailHmacSecret: () => {
      const secret = env.EMAIL_HMAC_SECRET;
      if (!secret || secret.length < 32) {
        throw new Error("EMAIL_HMAC_SECRET must be set (32 characters or more).");
      }
      return secret;
    },
    now: () => new Date(),
  };
}

/**
 * The HTTP API. Mounted by the web app under `/api` (same origin, no CORS),
 * and runnable on its own if it ever needs to become a separate service.
 */
export function createApp(dependencies: AppDependencies) {
  const rpc = new RPCHandler(router);
  const services: ApiServices = { ...defaultServices(), ...dependencies.services };
  const app = new Hono().basePath(API_BASE_PATH);

  app.get("/health", (c) => c.json({ status: "ok", version: dependencies.version }));

  app.use("/rpc/*", async (c, next) => {
    const context: ApiContext = {
      version: dependencies.version,
      database: dependencies.database,
      viewer: await dependencies.resolveViewer(c.req.raw),
      services,
    };
    const { matched, response } = await rpc.handle(c.req.raw, { prefix: RPC_PREFIX, context });
    if (matched) {
      return c.newResponse(response.body, response);
    }
    await next();
  });

  app.notFound((c) => c.json({ error: "not_found" }, 404));

  app.onError((error, c) => {
    // Never log request bodies or user data here (docs/07-confiance-securite.md).
    console.error(`[api] ${c.req.method} ${new URL(c.req.url).pathname} failed: ${error.name}`);
    return c.json({ error: "internal_error" }, 500);
  });

  return app;
}
