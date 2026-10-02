import { createApiClient } from "@epilove/contracts/client";
import { describe, expect, it } from "vitest";
import { createApp } from "./app";

const app = createApp({ version: "test" });
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
