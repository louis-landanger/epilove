import { type KeyRing, keyRingFromEnv } from "@epilove/crypto";
import { findExport } from "@epilove/db/repositories/exports";
import { findPromptAnswerById } from "@epilove/db/repositories/profiles";
import { writeAudit } from "@epilove/db/repositories/safety";
import { createMailer, type Mailer, mailerConfigFromEnv } from "@epilove/email";
import { imgproxyConfigFromEnv } from "@epilove/media";
import { createStorage, type Storage, storageConfigFromEnv } from "@epilove/media/storage";
import { createMemoryRateLimiter } from "@epilove/rate-limit";
import { createRouterClient } from "@orpc/server";
import { RPCHandler } from "@orpc/server/fetch";
import { Hono } from "hono";
import type { ApiContext, ApiServices, Viewer, ViewerResolver } from "./context";
import { recordActivity } from "./lib/activity";
import { clientIp } from "./lib/client-ip";
import { createItunesCatalog, type MusicCatalog } from "./lib/music";
import { isValidVoiceSignature, parseRange } from "./lib/voice-url";
import { router } from "./router";

export const API_BASE_PATH = "/api";

/** Requests per minute across all procedures (docs/07, part B). Overridable for load and end-to-end tests. */
export const RPC_LIMITS = {
  member: Number(process.env.API_RATE_LIMIT_MEMBER) || 600,
  anonymous: Number(process.env.API_RATE_LIMIT_ANONYMOUS) || 120,
  windowSeconds: 60,
} as const;
export const RPC_PREFIX = `${API_BASE_PATH}/rpc`;

export interface AppDependencies {
  readonly version: string;
  readonly database: ApiContext["database"];
  readonly resolveViewer: ViewerResolver;
  /** Missing services fall back to environment-based defaults (see `defaultServices`). */
  readonly services?: Partial<ApiServices>;
  /** Records members' last activity (the member app, not the back-office). */
  readonly trackActivity?: boolean;
}

/** Services built from environment variables, created on first use. */
export function defaultServices(env: Record<string, string | undefined> = process.env): ApiServices {
  let storage: Storage | undefined;
  let keyRing: KeyRing | undefined;
  let mailer: Mailer | undefined;
  let music: MusicCatalog | undefined;
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
    keyRing: () => {
      keyRing ??= keyRingFromEnv(env);
      return keyRing;
    },
    mailer: () => {
      mailer ??= createMailer(mailerConfigFromEnv(env));
      return mailer;
    },
    music: () => {
      music ??= createItunesCatalog();
      return music;
    },
    appUrl: () => env.APP_URL ?? "http://localhost:3000",
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

  const ipHeaders = (process.env.API_IP_HEADERS ?? "x-forwarded-for")
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean);

  app.use("/rpc/*", async (c, next) => {
    const viewer = await dependencies.resolveViewer(c.req.raw);
    // Generic ceiling on every procedure, on top of the per-action quotas:
    // per member when signed in, per address otherwise.
    const ip = clientIp(c.req.raw.headers, ipHeaders);
    const key = viewer ? `member:${viewer.userId}` : `ip:${ip ?? "unknown"}`;
    const limit = viewer ? RPC_LIMITS.member : RPC_LIMITS.anonymous;
    const { allowed, resetInSeconds } = await services.limiter.consume(
      `rpc:${key}`,
      limit,
      RPC_LIMITS.windowSeconds,
    );
    if (!allowed) {
      return c.json({ error: "rate_limited" }, 429, { "Retry-After": String(resetInSeconds) });
    }
    const context: ApiContext = {
      version: dependencies.version,
      database: dependencies.database,
      viewer,
      services,
    };
    if (dependencies.trackActivity) {
      void recordActivity(context);
    }
    const { matched, response } = await rpc.handle(c.req.raw, { prefix: RPC_PREFIX, context });
    if (matched) {
      return c.newResponse(response.body, response);
    }
    await next();
  });

  // Data export download (SAF-14): only for its owner, only while ready and not expired.
  app.get("/export/:id", async (c) => {
    const viewer = await dependencies.resolveViewer(c.req.raw);
    const id = c.req.param("id");
    if (!viewer || !/^[0-9a-f-]{36}$/.test(id)) {
      return c.json({ error: "not_found" }, 404);
    }
    const db = dependencies.database();
    const row = await findExport(db, id);
    if (
      !row ||
      row.userId !== viewer.userId ||
      row.status !== "ready" ||
      !row.storageKey ||
      !row.expiresAt ||
      row.expiresAt <= services.now()
    ) {
      return c.json({ error: "not_found" }, 404);
    }
    const body = await services.storage().read(row.storageKey);
    await writeAudit(db, {
      actorId: viewer.userId,
      action: "export.downloaded",
      targetType: "export",
      targetId: id,
    });
    return c.body(body as Uint8Array<ArrayBuffer>, 200, {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="epilove-export-${row.createdAt.toISOString().slice(0, 10)}.zip"`,
      "Cache-Control": "no-store",
    });
  });

  // Voice answers (PRO-06): the signed URL is the capability, handed out after the access checks.
  app.get("/voice/:id", async (c) => {
    const id = c.req.param("id");
    if (
      !/^[0-9a-f-]{36}$/.test(id) ||
      !isValidVoiceSignature(services, id, c.req.query("exp"), c.req.query("sig"))
    ) {
      return c.json({ error: "not_found" }, 404);
    }
    const answer = await findPromptAnswerById(dependencies.database(), id);
    if (answer?.voiceStage !== "ready" || !answer.voiceKey || !answer.voiceContentType) {
      return c.json({ error: "not_found" }, 404);
    }
    const body = await services.storage().read(answer.voiceKey);
    const headers = {
      "Content-Type": answer.voiceContentType,
      "Accept-Ranges": "bytes",
      "Cache-Control": "private, max-age=600",
    };
    const range = parseRange(c.req.header("range"), body.length);
    if (range) {
      return c.body(body.slice(range.start, range.end + 1) as Uint8Array<ArrayBuffer>, 206, {
        ...headers,
        "Content-Range": `bytes ${range.start}-${range.end}/${body.length}`,
      });
    }
    return c.body(body as Uint8Array<ArrayBuffer>, 200, headers);
  });

  app.notFound((c) => c.json({ error: "not_found" }, 404));

  app.onError((error, c) => {
    // Never log request bodies or user data here (docs/07-confiance-securite.md).
    console.error(`[api] ${c.req.method} ${new URL(c.req.url).pathname} failed: ${error.name}`);
    return c.json({ error: "internal_error" }, 500);
  });

  return app;
}

/**
 * Calls the procedures in-process, for server-rendered pages: same
 * validation, policies and errors as over HTTP, without a network hop.
 */
export function createServerClient(
  dependencies: Omit<AppDependencies, "resolveViewer">,
  viewer: Viewer | null,
) {
  const context: ApiContext = {
    version: dependencies.version,
    database: dependencies.database,
    viewer,
    services: { ...defaultServices(), ...dependencies.services },
  };
  if (dependencies.trackActivity) {
    void recordActivity(context);
  }
  return createRouterClient(router, { context });
}
