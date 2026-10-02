import { describe, expect, it } from "vitest";
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
