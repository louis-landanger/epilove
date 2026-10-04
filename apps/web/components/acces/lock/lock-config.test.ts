import { describe, expect, it } from "vitest";
import { checkPin, earlyLockScript, isPin, parseConfig, pinConfig, shouldLock } from "./lock-config";

describe("app lock (SAF-13)", () => {
  it("locks a new tab and after the background timeout", () => {
    const config = { version: 1, method: "pin", timeoutMinutes: 5, pin: { salt: "s", hash: "h" } } as const;
    expect(shouldLock(null, null, 0)).toBe(false);
    expect(shouldLock(config, null, 0)).toBe(true);
    expect(shouldLock(config, { activeAt: 0 }, 5 * 60_000)).toBe(false);
    expect(shouldLock(config, { activeAt: 0 }, 5 * 60_000 + 1)).toBe(true);
    expect(shouldLock({ ...config, timeoutMinutes: 0 }, { activeAt: 0 }, 9_000)).toBe(false);
    expect(shouldLock({ ...config, timeoutMinutes: 0 }, { activeAt: 0 }, 10_001)).toBe(true);
  });

  it("stores a salted hash, never the PIN", async () => {
    const config = await pinConfig("4821", 1);
    expect(JSON.stringify(config)).not.toContain("4821");
    expect(await checkPin(config, "4821")).toBe(true);
    expect(await checkPin(config, "4822")).toBe(false);
    expect(await checkPin(config, "48")).toBe(false);
    const other = await pinConfig("4821", 1);
    expect(other.pin?.hash).not.toBe(config.pin?.hash);
  });

  it("only accepts well-formed settings", () => {
    expect(isPin("1234")).toBe(true);
    expect(isPin("12a4")).toBe(false);
    expect(parseConfig("{")).toBeNull();
    expect(parseConfig(JSON.stringify({ version: 1, method: "pin", timeoutMinutes: 5 }))).toBeNull();
    expect(parseConfig(JSON.stringify({ version: 1, method: "passkey", timeoutMinutes: 7 }))).toBeNull();
    expect(parseConfig(JSON.stringify({ version: 1, method: "passkey", timeoutMinutes: 1 }))).not.toBeNull();
  });

  it("builds an early script that only reads this member's keys", () => {
    const script = earlyLockScript("0199a000-0000-7000-8000-000000000000");
    expect(script).toContain("atomes:lock:0199a000-0000-7000-8000-000000000000");
    expect(script).not.toContain("</script");
  });
});
