import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { watchWaitlistStats } from "./stats-store";

const { createApiClient } = vi.hoisted(() => ({
  createApiClient: vi.fn(() => ({ waitlist: { stats: async () => null } })),
}));
vi.mock("@atomes/contracts/client", () => ({ createApiClient }));

describe("waitlist stats", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("document", {
      visibilityState: "visible",
      addEventListener: () => {},
      removeEventListener: () => {},
    });
    vi.stubGlobal("window", { location: { origin: "http://localhost" } });
    createApiClient.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("leaves the RPC client out of the page's load, refreshing only once it has settled", async () => {
    const stop = watchWaitlistStats(() => {});
    // Lighthouse measures the landing's first few seconds: its scripts budget counts whatever loads then.
    await vi.advanceTimersByTimeAsync(8_000);
    expect(createApiClient).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(4_000);
    expect(createApiClient).toHaveBeenCalledTimes(1);
    stop();
  });
});
