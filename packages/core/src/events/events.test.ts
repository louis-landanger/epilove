import { describe, expect, it } from "vitest";
import { canUseApp } from "../policies/profile-access";
import { testMember } from "../policies/testing";
import {
  attendanceVisible,
  canOrganize,
  checkEventDraft,
  type EventDraft,
  eventEndsAt,
  eventOpenTo,
} from "./events";

const now = new Date("2026-10-01T10:00:00Z");
const draft = (overrides: Partial<EventDraft> = {}): EventDraft => ({
  title: "Afterwork de rentrée",
  organizerName: "BDE",
  description: "",
  venue: "Place Valmy",
  spotId: null,
  startsAt: new Date("2026-10-08T17:00:00Z"),
  endsAt: null,
  ...overrides,
});

describe("events (IRL-01)", () => {
  it("lets organizers and administrators publish, nobody else", () => {
    expect(canOrganize("organizer")).toBe(true);
    expect(canOrganize("admin")).toBe(true);
    expect(canOrganize("user")).toBe(false);
    expect(canOrganize("moderator")).toBe(false);
  });

  it("is for adult members with a usable account", () => {
    const today = "2026-10-01";
    expect(canUseApp(testMember({ id: "a", birthDate: "2000-01-01" }), today)).toBe(true);
    expect(canUseApp(testMember({ id: "b", birthDate: "2000-01-01", status: "paused" }), today)).toBe(true);
    expect(canUseApp(testMember({ id: "c", birthDate: "2000-01-01", status: "banned" }), today)).toBe(false);
    expect(canUseApp(testMember({ id: "d", birthDate: "2008-10-02" }), today)).toBe(false);
  });

  it("checks a draft", () => {
    expect(checkEventDraft(draft(), now)).toEqual({ ok: true });
    expect(checkEventDraft(draft({ title: "  " }), now)).toEqual({ ok: false, reason: "title_required" });
    expect(checkEventDraft(draft({ organizerName: "" }), now)).toEqual({
      ok: false,
      reason: "organizer_required",
    });
    expect(checkEventDraft(draft({ venue: " ", spotId: null }), now)).toEqual({
      ok: false,
      reason: "no_place",
    });
    expect(checkEventDraft(draft({ venue: null, spotId: "spot" }), now)).toEqual({ ok: true });
    expect(checkEventDraft(draft({ startsAt: new Date("2026-09-30T10:00:00Z") }), now)).toEqual({
      ok: false,
      reason: "in_the_past",
    });
    expect(checkEventDraft(draft({ startsAt: new Date("2027-11-01T10:00:00Z") }), now)).toEqual({
      ok: false,
      reason: "too_far",
    });
    expect(checkEventDraft(draft({ endsAt: new Date("2026-10-08T16:00:00Z") }), now)).toEqual({
      ok: false,
      reason: "ends_before_start",
    });
    expect(checkEventDraft(draft({ endsAt: new Date("2026-10-09T18:00:00Z") }), now)).toEqual({
      ok: false,
      reason: "too_long",
    });
  });

  it("ends three hours after the start without an end time", () => {
    const startsAt = new Date("2026-10-08T17:00:00Z");
    expect(eventEndsAt({ startsAt, endsAt: null }).toISOString()).toBe("2026-10-08T20:00:00.000Z");
    const endsAt = new Date("2026-10-08T23:30:00Z");
    expect(eventEndsAt({ startsAt, endsAt })).toBe(endsAt);
  });

  it("opens to the whole campus or to the chosen schools", () => {
    expect(eventOpenTo({ schoolSlugs: [] }, "isg")).toBe(true);
    expect(eventOpenTo({ schoolSlugs: ["epita", "ipsa"] }, "ipsa")).toBe(true);
    expect(eventOpenTo({ schoolSlugs: ["epita"] }, "isg")).toBe(false);
  });

  it("shows attendance between matches only when both share it", () => {
    expect(attendanceVisible({ shares: true }, { shares: true })).toBe(true);
    expect(attendanceVisible({ shares: true }, { shares: false })).toBe(false);
    expect(attendanceVisible({ shares: false }, { shares: true })).toBe(false);
  });
});
