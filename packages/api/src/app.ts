import { RPCHandler } from "@orpc/server/fetch";
import { Hono } from "hono";
import { type ApiContext, router } from "./router";

export const API_BASE_PATH = "/api";
export const RPC_PREFIX = `${API_BASE_PATH}/rpc`;

/**
 * The HTTP API. Mounted by the web app under `/api` (same origin, no CORS),
 * and runnable on its own if it ever needs to become a separate service.
 */
export function createApp(context: ApiContext) {
  const rpc = new RPCHandler(router);
  const app = new Hono().basePath(API_BASE_PATH);

  app.get("/health", (c) => c.json({ status: "ok", version: context.version }));

  app.use("/rpc/*", async (c, next) => {
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
