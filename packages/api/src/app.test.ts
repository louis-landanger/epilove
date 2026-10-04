import { createApiClient } from "@atomes/contracts/client";
import { createMemoryRateLimiter } from "@atomes/rate-limit";
import { describe, expect, it, vi } from "vitest";
import { createApp, createServerClient } from "./app";
import { anonymous, devHeaderResolver } from "./context";

const app = createApp({
  version: "test",
  database: () => {
    throw new Error("These tests do not use the database.");
  },
  resolveViewer: anonymous,
});
const client = createApiClient({
  url: "http://localhost/api/rpc",
  fetch: (request) => Promise.resolve(app.fetch(request)),
});

describe("api", () => {
  it("answers the plain health check", async () => {
    const response = await app.request("/api/health");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok", version: "test" });
  });

  it("serves typed RPC procedures", async () => {
    const health = await client.system.health();
    expect(health.status).toBe("ok");
    expect(health.version).toBe("test");
  });

  it("checks school emails without revealing anything else", async () => {
    await expect(client.campus.checkEmail({ email: "Prenom.Nom+x@ISG.fr" })).resolves.toEqual({
      eligible: true,
      school: { slug: "isg", name: "ISG" },
    });
    await expect(client.campus.checkEmail({ email: "someone@gmail.com" })).resolves.toEqual({
      eligible: false,
      reason: "domain_not_allowed",
    });
  });

  it("rejects invalid input", async () => {
    await expect(client.campus.checkEmail({ email: "a".repeat(400) })).rejects.toThrow();
  });

  it("returns a JSON 404 for unknown routes", async () => {
    const response = await app.request("/api/nope");
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "not_found" });
  });
});

describe("error log", () => {
  it("does not report requests the client gave up on", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      // What Node reports when a browser closes the connection while sending the body.
      const controller = new AbortController();
      const body = new ReadableStream({
        start(stream) {
          controller.abort();
          stream.error(new Error("aborted"));
        },
      });
      await Promise.resolve(
        app.fetch(
          new Request("http://localhost/api/rpc/campus/checkEmail", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body,
            duplex: "half",
            signal: controller.signal,
          } as RequestInit),
        ),
      ).catch(() => undefined);
      expect(errors.mock.calls.flat().join(" ")).not.toContain("procedure failed");
    } finally {
      errors.mockRestore();
    }
  });
});

describe("viewer resolution", () => {
  const resolve = devHeaderResolver({ APP_ENV: "test" });

  it("reads the development header only when it holds a UUID", async () => {
    const id = "01920000-0000-7000-8000-000000000001";
    await expect(resolve(new Request("http://x", { headers: { "x-dev-user-id": id } }))).resolves.toEqual({
      userId: id,
      role: "user",
    });
    await expect(
      resolve(new Request("http://x", { headers: { "x-dev-user-id": "admin" } })),
    ).resolves.toBeNull();
    await expect(resolve(new Request("http://x"))).resolves.toBeNull();
    await expect(
      resolve(new Request("http://x", { headers: { cookie: `theme=dark; atomes_dev_user=${id}` } })),
    ).resolves.toEqual({ userId: id, role: "user" });
  });

  it("refuses to run outside development and test, including when APP_ENV is unset", () => {
    expect(() => devHeaderResolver({ APP_ENV: "production" })).toThrow();
    expect(() => devHeaderResolver({ APP_ENV: "staging" })).toThrow();
    expect(() => devHeaderResolver({ NODE_ENV: "development" })).toThrow();
  });
});

describe("rate limiting", () => {
  it("caps anonymous requests per address", async () => {
    const limited = createApp({
      version: "test",
      database: () => {
        throw new Error("unused");
      },
      resolveViewer: anonymous,
    });
    const call = (ip: string) =>
      limited.request("/api/rpc/system/health", { method: "POST", headers: { "x-forwarded-for": ip } });
    for (let index = 0; index < 120; index += 1) {
      expect((await call("10.9.9.9")).status).toBe(200);
    }
    const blocked = await call("10.9.9.9");
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("retry-after")).toBeTruthy();
    expect((await call("10.9.9.8")).status).toBe(200);
  });

  it("does not apply the per-address ceiling to in-process calls of public pages", async () => {
    const services = { limiter: createMemoryRateLimiter() };
    const dependencies = {
      version: "test",
      database: () => {
        throw new Error("unused");
      },
      services,
    };
    const server = createServerClient(dependencies, null);
    for (let index = 0; index < 150; index += 1) {
      await expect(server.system.health()).resolves.toMatchObject({ status: "ok" });
    }
  });
});
