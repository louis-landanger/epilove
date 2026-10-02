import { describe, expect, it } from "vitest";
import {
  FLASH_ALPHABET,
  flashExpiresAt,
  flashOpen,
  flashWindow,
  normalizeFlashCode,
  toFlashCode,
} from "./flash";

describe("Flash (IRL-04)", () => {
  it("changes window every 30 seconds", () => {
    const now = new Date("2026-10-02T12:00:10Z");
    expect(flashWindow(new Date("2026-10-02T12:00:29Z"))).toBe(flashWindow(now));
    expect(flashWindow(new Date("2026-10-02T12:00:30Z"))).toBe(flashWindow(now) + 1);
    expect(flashExpiresAt(now).toISOString()).toBe("2026-10-02T12:00:30.000Z");
  });

  it("opens half an hour before the start, until the end, for those who answered", () => {
    const event = { status: "published", startsAt: new Date("2026-10-02T18:00:00Z"), endsAt: null };
    expect(flashOpen(event, true, new Date("2026-10-02T17:40:00Z"))).toBe(true);
    expect(flashOpen(event, true, new Date("2026-10-02T17:20:00Z"))).toBe(false);
    expect(flashOpen(event, true, new Date("2026-10-02T21:00:00Z"))).toBe(false);
    expect(flashOpen(event, false, new Date("2026-10-02T18:30:00Z"))).toBe(false);
    expect(flashOpen({ ...event, status: "cancelled" }, true, new Date("2026-10-02T18:30:00Z"))).toBe(false);
  });

  it("encodes eight easy characters and forgives typing", () => {
    const code = toFlashCode(new Uint8Array([255, 0, 128, 64, 32, 16, 8]));
    expect(code).toHaveLength(8);
    expect([...code].every((c) => FLASH_ALPHABET.includes(c))).toBe(true);
    expect(normalizeFlashCode("ab1o-il 2z")).toBe("AB10112Z");
  });
});
