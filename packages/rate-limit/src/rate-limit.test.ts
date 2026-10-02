import { afterAll, describe, expect, it } from "vitest";
import { createMemoryRateLimiter, createValkeyRateLimiter, Redis } from "./index";

describe("memory rate limiter", () => {
  it("allows up to the limit, then resets after the window", async () => {
    let now = 0;
    const limiter = createMemoryRateLimiter(() => now);
    const results = [];
    for (let i = 0; i < 4; i += 1) {
      results.push(await limiter.consume("k", 3, 60));
    }
    expect(results.map((r) => r.allowed)).toEqual([true, true, true, false]);
    now = 61_000;
    expect((await limiter.consume("k", 3, 60)).allowed).toBe(true);
  });
});

const url = process.env.VALKEY_URL;

/** Needs Valkey (`pnpm services:up`). */
describe.skipIf(!url)("valkey rate limiter", () => {
  const client = new Redis(url ?? "");
  afterAll(() => client.quit());

  it("counts atomically and expires the window", async () => {
    const limiter = createValkeyRateLimiter(client, `test-${Date.now()}`);
    const results = await Promise.all(Array.from({ length: 5 }, () => limiter.consume("burst", 3, 30)));
    expect(results.filter((r) => r.allowed)).toHaveLength(3);
    expect(results.every((r) => r.resetInSeconds > 0 && r.resetInSeconds <= 30)).toBe(true);
  });
});
