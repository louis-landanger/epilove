import { describe, expect, it } from "vitest";
import { blindEvening, blindRevealed } from "./blind";

const PARIS = "Europe/Paris";

describe("blind mode (DEC-10)", () => {
  it("runs on Thursday evenings, campus time", () => {
    // Friday 2 October 2026: the next one is Thursday 8 October at 19:00 (17:00 UTC).
    const friday = blindEvening(new Date("2026-10-02T12:00:00Z"), PARIS);
    expect(friday).toEqual({
      startsAt: new Date("2026-10-08T17:00:00Z"),
      endsAt: new Date("2026-10-08T22:00:00Z"),
      active: false,
    });
    expect(blindEvening(new Date("2026-10-08T18:30:00Z"), PARIS).active).toBe(true);
    expect(blindEvening(new Date("2026-10-08T16:59:00Z"), PARIS).active).toBe(false);
    // Just after midnight: the next week's.
    expect(blindEvening(new Date("2026-10-08T22:01:00Z"), PARIS).startsAt).toEqual(
      new Date("2026-10-15T17:00:00Z"),
    );
    // After the clocks go back, 19:00 is 18:00 UTC.
    expect(blindEvening(new Date("2026-10-29T18:30:00Z"), PARIS)).toMatchObject({
      startsAt: new Date("2026-10-29T18:00:00Z"),
      active: true,
    });
  });

  it("reveals photos once both sent ten messages", () => {
    expect(blindRevealed({ mine: 10, theirs: 10 })).toBe(true);
    expect(blindRevealed({ mine: 25, theirs: 9 })).toBe(false);
    expect(blindRevealed({ mine: 0, theirs: 0 })).toBe(false);
  });
});
