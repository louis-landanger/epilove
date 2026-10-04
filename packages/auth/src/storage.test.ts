import { Redis } from "@atomes/rate-limit";
import { afterAll, describe, expect, it } from "vitest";
import { valkeySecondaryStorage } from "./storage";

const url = process.env.VALKEY_URL;

/** Needs Valkey (`pnpm services:up`). */
describe.skipIf(!url)("valkey secondary storage", () => {
  const client = new Redis(url ?? "");
  const prefix = `test-${Date.now()}:`;
  const storage = valkeySecondaryStorage(client, prefix);
  afterAll(() => client.quit());

  it("stores, reads once and deletes", async () => {
    await storage.set("a", "1", 30);
    expect(await storage.get("a")).toBe("1");
    expect(await storage.getAndDelete("a")).toBe("1");
    expect(await storage.get("a")).toBeNull();
  });

  it("increments within a fixed window", async () => {
    expect(await storage.increment("n", 30)).toBe(1);
    expect(await storage.increment("n", 30)).toBe(2);
    const ttl = await client.ttl(`${prefix}n`);
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(30);
  });
});
