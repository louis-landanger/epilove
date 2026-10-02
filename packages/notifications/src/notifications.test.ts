import { describe, expect, it } from "vitest";
import { digestIsEmpty, renderDigest } from "./digest";
import { DEFAULT_QUIET_HOURS, inQuietHours, localHour, pushAllowedAt } from "./quiet-hours";
import { renderPush } from "./render";
import { groupOf, NOTIFICATION_TYPES, notificationUrl } from "./types";

describe("renderPush", () => {
  it("never shows a first name when discreet (the default)", () => {
    for (const type of NOTIFICATION_TYPES) {
      const content = renderPush(type, {
        discreet: true,
        otherFirstName: "Inès",
        payload: { matchId: "m1" },
      });
      expect(`${content.title} ${content.body}`).not.toContain("Inès");
    }
  });

  it("shows who wrote only when discretion is off, never the message itself", () => {
    expect(renderPush("message_received", { discreet: false, otherFirstName: "Hugo" }).body).toBe(
      "Nouveau message de Hugo",
    );
    expect(renderPush("message_received", { discreet: true, otherFirstName: "Hugo" }).body).toBe(
      "Nouveau message",
    );
  });

  it("groups notifications of the same conversation", () => {
    const a = renderPush("message_received", { discreet: true, payload: { matchId: "m1" } });
    const b = renderPush("message_received", { discreet: true, payload: { matchId: "m1" } });
    expect(a.tag).toBe(b.tag);
    expect(a.url).toBe("/messages/m1");
  });

  it("knows the group and destination of every type", () => {
    for (const type of NOTIFICATION_TYPES) {
      expect(groupOf(type)).toBeTruthy();
      expect(notificationUrl(type, null)).toMatch(/^\//);
    }
  });
});

describe("quiet hours (NOT-04)", () => {
  const PARIS = "Europe/Paris";
  // 23:30 in Paris in October (UTC+2).
  const night = new Date("2026-10-02T21:30:00Z");
  const day = new Date("2026-10-02T10:00:00Z");

  it("reads the campus hour", () => {
    expect(localHour(night, PARIS)).toBe(23);
    expect(localHour(new Date("2026-10-02T22:30:00Z"), PARIS)).toBe(0);
  });

  it("handles windows across midnight and within a day", () => {
    expect(inQuietHours(DEFAULT_QUIET_HOURS, 23)).toBe(true);
    expect(inQuietHours(DEFAULT_QUIET_HOURS, 3)).toBe(true);
    expect(inQuietHours(DEFAULT_QUIET_HOURS, 8)).toBe(false);
    expect(inQuietHours(DEFAULT_QUIET_HOURS, 22)).toBe(false);
    const afternoon = { ...DEFAULT_QUIET_HOURS, startHour: 13, endHour: 15 };
    expect(inQuietHours(afternoon, 14)).toBe(true);
    expect(inQuietHours(afternoon, 15)).toBe(false);
    expect(inQuietHours({ ...DEFAULT_QUIET_HOURS, enabled: false }, 23)).toBe(false);
  });

  it("holds pushes at night, except messages on request and the safety check-in", () => {
    expect(pushAllowedAt("like_received", DEFAULT_QUIET_HOURS, day, PARIS)).toBe(true);
    expect(pushAllowedAt("like_received", DEFAULT_QUIET_HOURS, night, PARIS)).toBe(false);
    expect(pushAllowedAt("message_received", DEFAULT_QUIET_HOURS, night, PARIS)).toBe(false);
    const messages = { ...DEFAULT_QUIET_HOURS, allowMessages: true };
    expect(pushAllowedAt("message_received", messages, night, PARIS)).toBe(true);
    expect(pushAllowedAt("chat_nudge", messages, night, PARIS)).toBe(false);
    expect(pushAllowedAt("date_check_in", DEFAULT_QUIET_HOURS, night, PARIS)).toBe(true);
  });
});

describe("weekly digest (NOT-05)", () => {
  const base = {
    likes: null,
    matches: null,
    unreadConversations: null,
    events: null,
    pactClosesAt: null,
    appUrl: "https://app.example/",
    timeZone: "Europe/Paris",
  };

  it("is not sent when there is nothing to tell", () => {
    expect(digestIsEmpty(base)).toBe(true);
    expect(digestIsEmpty({ ...base, likes: 0, events: [] })).toBe(true);
    expect(digestIsEmpty({ ...base, likes: 2 })).toBe(false);
  });

  it("gives counts and campus events, escaped, with a way out", () => {
    const digest = renderDigest({
      ...base,
      likes: 3,
      matches: 1,
      events: [{ title: "Quiz <script>", startsAt: new Date("2026-10-08T17:00:00Z") }],
    });
    expect(digest.text).toContain("3 personnes t'ont liké cette semaine.");
    expect(digest.text).toContain("1 nouvelle liaison.");
    expect(digest.text).toContain("Quiz <script>, jeudi 8 octobre à 19:00");
    expect(digest.html).toContain("Quiz &lt;script&gt;");
    expect(digest.html).not.toContain("<script>");
    expect(digest.unsubscribeUrl).toBe("https://app.example/reglages/notifications");
  });
});
