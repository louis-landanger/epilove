import { describe, expect, it } from "vitest";
import { PACT_REVEAL_AT, remainingUntil } from "./pact";

describe("Pact countdown", () => {
  it("targets Thursday 11 February 2027 at 20:00 in Paris", () => {
    const target = new Date(PACT_REVEAL_AT);
    expect(target.toISOString()).toBe("2027-02-11T19:00:00.000Z");
    const paris = new Intl.DateTimeFormat("fr-FR", {
      timeZone: "Europe/Paris",
      weekday: "long",
      day: "numeric",
      month: "long",
      hour: "2-digit",
      minute: "2-digit",
    }).format(target);
    expect(paris).toBe("jeudi 11 février à 20:00");
  });

  it("splits the remaining time into days, hours, minutes and seconds", () => {
    const target = Date.parse(PACT_REVEAL_AT);
    const now = target - ((2 * 24 + 3) * 3600 + 4 * 60 + 5) * 1000 - 400;
    expect(remainingUntil(target, now)).toEqual({ days: 2, hours: 3, minutes: 4, seconds: 5 });
    expect(remainingUntil(target, target)).toBeNull();
    expect(remainingUntil(target, target + 1)).toBeNull();
  });
});
