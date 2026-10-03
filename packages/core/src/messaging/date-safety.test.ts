import { describe, expect, it } from "vitest";
import { checkShare, shareState, shareTimes } from "./date-safety";

const startsAt = new Date("2026-10-10T18:00:00Z");

describe("date safety kit (IRL-03)", () => {
  it("checks in three hours after the start and expires a day after", () => {
    expect(shareTimes(startsAt)).toEqual({
      checkInAt: new Date("2026-10-10T21:00:00Z"),
      expiresAt: new Date("2026-10-11T18:00:00Z"),
    });
  });

  it("tells active, revoked and expired links apart", () => {
    const expiresAt = new Date("2026-10-11T18:00:00Z");
    expect(shareState({ expiresAt, revokedAt: null }, new Date("2026-10-11T17:59:00Z"))).toBe("active");
    expect(shareState({ expiresAt, revokedAt: null }, expiresAt)).toBe("expired");
    expect(shareState({ expiresAt, revokedAt: new Date("2026-10-10T12:00:00Z") }, startsAt)).toBe("revoked");
  });

  it("shares accepted, unexpired dates within the limits", () => {
    const base = { status: "accepted", startsAt, activeForDate: 0, createdToday: 0, now: startsAt };
    expect(checkShare(base)).toEqual({ ok: true });
    expect(checkShare({ ...base, status: "proposed" })).toEqual({ ok: false, reason: "not_accepted" });
    expect(checkShare({ ...base, now: new Date("2026-10-11T18:00:00Z") })).toEqual({
      ok: false,
      reason: "over",
    });
    expect(checkShare({ ...base, activeForDate: 3 })).toEqual({ ok: false, reason: "too_many" });
    expect(checkShare({ ...base, createdToday: 10 })).toEqual({ ok: false, reason: "rate_limited" });
  });
});
