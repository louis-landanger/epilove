import { describe, expect, it } from "vitest";
import { canAppeal, canReviewAppeal, isValidStatement, sanctionEffect } from "./sanctions";

const now = new Date("2026-10-02T12:00:00Z");

describe("sanctionEffect", () => {
  it("leaves the account alone for a warning and lifts the hold", () => {
    expect(sanctionEffect({ action: "warning" }, now)).toEqual({
      status: null,
      revokeSessions: false,
      expiresAt: null,
      releaseHold: true,
    });
  });

  it("time-bounds restrictions and suspensions", () => {
    const suspension = sanctionEffect({ action: "suspension", durationDays: 7 }, now);
    expect(suspension.status).toBe("suspended");
    expect(suspension.expiresAt?.toISOString()).toBe("2026-10-09T12:00:00.000Z");
    expect(sanctionEffect({ action: "restriction", durationDays: 30 }, now).status).toBe("restricted");
  });

  it("bans for good, ending every session", () => {
    expect(sanctionEffect({ action: "ban" }, now)).toMatchObject({
      status: "banned",
      revokeSessions: true,
      expiresAt: null,
    });
  });
});

describe("isValidStatement", () => {
  it("requires an actual explanation", () => {
    expect(isValidStatement("Non.")).toBe(false);
    expect(isValidStatement("Messages insultants répétés envoyés à plusieurs membres.")).toBe(true);
  });
});

describe("appeals", () => {
  const decidedAt = new Date("2026-04-02T12:00:00Z");

  it("can be filed once, within six months, against an actual measure", () => {
    expect(canAppeal({ action: "suspension", createdAt: decidedAt }, false, now)).toBe(true);
    expect(canAppeal({ action: "suspension", createdAt: decidedAt }, true, now)).toBe(false);
    expect(canAppeal({ action: "no_action", createdAt: decidedAt }, false, now)).toBe(false);
    expect(canAppeal({ action: "ban", createdAt: new Date("2026-03-01T00:00:00Z") }, false, now)).toBe(false);
  });

  it("is reviewed by another moderator", () => {
    expect(canReviewAppeal("a", "b")).toBe(true);
    expect(canReviewAppeal("a", "a")).toBe(false);
    expect(canReviewAppeal("a", null)).toBe(true);
  });
});
