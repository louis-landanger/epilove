import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { checkDecision, DISCOVERY_RULES, dailyLikeQuota, quotaStatus, startOfCampusDay } from "./rules";

const now = new Date("2026-10-02T18:00:00Z");
const old = new Date("2026-09-01T00:00:00Z");
const fresh = new Date("2026-10-01T20:00:00Z");

describe("quotas", () => {
  it("gives new accounts a smaller like budget for 48 hours", () => {
    expect(dailyLikeQuota(old, now)).toBe(20);
    expect(dailyLikeQuota(fresh, now)).toBe(10);
    expect(dailyLikeQuota(fresh, new Date("2026-10-03T20:00:01Z"))).toBe(20);
  });

  it("never goes negative and caps super likes by the remaining likes", () => {
    fc.assert(
      fc.property(fc.nat(40), fc.nat(5), fc.nat(5), (likes, superlikes, undos) => {
        const status = quotaStatus(
          { likesToday: likes, superlikesToday: superlikes, undosToday: undos },
          old,
          now,
        );
        expect(status.likesLeft).toBeGreaterThanOrEqual(0);
        expect(status.superlikesLeft).toBeLessThanOrEqual(status.likesLeft);
        expect(status.undosLeft).toBeGreaterThanOrEqual(0);
      }),
    );
  });

  it("refuses likes over the quota but always allows passes", () => {
    const exhausted = quotaStatus({ likesToday: 20, superlikesToday: 0, undosToday: 0 }, old, now);
    expect(checkDecision("like", null, exhausted)).toEqual({ ok: false, reason: "quota_exceeded" });
    expect(checkDecision("pass", null, exhausted)).toEqual({ ok: true });
  });

  it("requires a comment with a super like, at most one per day", () => {
    const status = quotaStatus({ likesToday: 3, superlikesToday: 0, undosToday: 0 }, old, now);
    expect(checkDecision("superlike", "  ", status)).toEqual({ ok: false, reason: "comment_required" });
    expect(checkDecision("superlike", "Ta réponse sur Fourvière !", status)).toEqual({ ok: true });
    const used = quotaStatus({ likesToday: 3, superlikesToday: 1, undosToday: 0 }, old, now);
    expect(checkDecision("superlike", "Encore", used)).toEqual({
      ok: false,
      reason: "superlike_quota_exceeded",
    });
  });

  it("limits comments to 150 characters", () => {
    const status = quotaStatus({ likesToday: 0, superlikesToday: 0, undosToday: 0 }, old, now);
    expect(checkDecision("like", "x".repeat(DISCOVERY_RULES.commentMaxLength + 1), status)).toEqual({
      ok: false,
      reason: "comment_too_long",
    });
  });
});

describe("startOfCampusDay", () => {
  it("returns Paris midnight, across daylight saving changes", () => {
    expect(startOfCampusDay(now, "Europe/Paris").toISOString()).toBe("2026-10-01T22:00:00.000Z");
    expect(startOfCampusDay(new Date("2026-12-15T10:00:00Z"), "Europe/Paris").toISOString()).toBe(
      "2026-12-14T23:00:00.000Z",
    );
    expect(startOfCampusDay(new Date("2026-10-01T22:30:00Z"), "Europe/Paris").toISOString()).toBe(
      "2026-10-01T22:00:00.000Z",
    );
  });
});
