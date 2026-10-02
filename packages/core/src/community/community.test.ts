import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { availabilityShown, checkAvailability } from "./availability";
import { badgesOf } from "./badges";
import {
  anonymousResults,
  crossSchoolIndex,
  isoWeek,
  questionForWeek,
  recentWeeks,
  weekEndsAt,
  weeklyAgreement,
  weekNumber,
} from "./community";

const PARIS = "Europe/Paris";

describe("question of the week (COM-01)", () => {
  it("numbers weeks the ISO way, in campus time", () => {
    expect(isoWeek(new Date("2026-10-02T12:00:00Z"), PARIS)).toBe("2026-W40");
    // Monday 00:30 in Paris is still Sunday 22:30 UTC: already the new week on campus.
    expect(isoWeek(new Date("2026-10-04T22:30:00Z"), PARIS)).toBe("2026-W41");
    expect(isoWeek(new Date("2026-10-04T21:30:00Z"), PARIS)).toBe("2026-W40");
    // ISO years: 1 January 2027 is a Friday, still in 2026-W53.
    expect(isoWeek(new Date("2027-01-01T12:00:00Z"), PARIS)).toBe("2026-W53");
    expect(isoWeek(new Date("2027-01-04T12:00:00Z"), PARIS)).toBe("2027-W01");
  });

  it("rotates through the bank one question a week, across years", () => {
    expect(weekNumber("2027-W01") - weekNumber("2026-W53")).toBe(1);
    expect(weekNumber("2026-W41") - weekNumber("2026-W40")).toBe(1);
    const bank = ["a", "b", "c"];
    const picks = ["2026-W52", "2026-W53", "2027-W01", "2027-W02"].map((w) => questionForWeek(bank, w));
    expect(new Set(picks.slice(0, 3)).size).toBe(3);
    expect(picks[3]).toBe(picks[0]);
    expect(questionForWeek([], "2026-W40")).toBeNull();
  });

  it("ends the week on Monday at midnight, campus time, across the clock change", () => {
    expect(weekEndsAt(new Date("2026-10-02T12:00:00Z"), PARIS).toISOString()).toBe(
      "2026-10-04T22:00:00.000Z",
    );
    // Clocks go back on 25 October 2026: Monday 26 at midnight is 23:00 UTC.
    expect(weekEndsAt(new Date("2026-10-25T12:00:00Z"), PARIS).toISOString()).toBe(
      "2026-10-25T23:00:00.000Z",
    );
    // On Monday morning, the week ends the following Monday.
    expect(weekEndsAt(new Date("2026-10-05T06:00:00Z"), PARIS).toISOString()).toBe(
      "2026-10-11T22:00:00.000Z",
    );
  });

  it("lists the recent weeks, newest first", () => {
    expect(recentWeeks(new Date("2026-10-02T12:00:00Z"), PARIS, 3)).toEqual([
      "2026-W40",
      "2026-W39",
      "2026-W38",
    ]);
  });

  it("measures agreement over the weeks both answered", () => {
    const a = new Map([
      ["2026-W38", "x"],
      ["2026-W39", "y"],
      ["2026-W40", "z"],
    ]);
    const b = new Map([
      ["2026-W39", "y"],
      ["2026-W40", "w"],
    ]);
    expect(weeklyAgreement(a, b)).toBe(0.5);
    expect(weeklyAgreement(a, new Map([["2026-W40", "z"]]))).toBeNull();
    expect(weeklyAgreement(a, undefined)).toBeNull();
  });
});

describe("anonymous aggregates (COM-01, COM-02, PAC-04)", () => {
  it("leaves out small groups and never lets them be inferred", () => {
    const counts = [
      { group: "epita", option: "yes", count: 8 },
      { group: "epita", option: "no", count: 4 },
      { group: "isg", option: "yes", count: 2 },
      { group: "isg", option: "no", count: 1 },
    ];
    const results = anonymousResults(counts, ["yes", "no"]);
    expect(results.groups).toEqual([
      {
        group: "epita",
        total: 12,
        shares: [
          { option: "yes", percent: 67 },
          { option: "no", percent: 33 },
        ],
      },
    ]);
    // Campus minus EPITA would give ISG's three answers: no overall figure.
    expect(results.overall).toBeNull();

    // Once ISG reaches ten answers, nothing is hidden any more.
    const more = anonymousResults([...counts, { group: "isg", option: "no", count: 7 }], ["yes", "no"]);
    expect(more.groups.map((g) => g.group)).toEqual(["epita", "isg"]);
    expect(more.overall?.total).toBe(22);
  });

  it("never reveals a hidden group by subtraction (property)", () => {
    const group = fc.constantFrom("epita", "esme", "isg", "ipsa", "supbiotech");
    const option = fc.constantFrom("a", "b", "c");
    fc.assert(
      fc.property(
        fc.array(fc.record({ group, option, count: fc.integer({ min: 1, max: 15 }) })),
        (counts) => {
          const results = anonymousResults(counts, ["a", "b", "c"]);
          for (const g of results.groups) {
            expect(g.total).toBeGreaterThanOrEqual(10);
          }
          if (results.overall) {
            const hidden = results.overall.total - results.groups.reduce((sum, g) => sum + g.total, 0);
            expect(hidden === 0 || hidden >= 10).toBe(true);
          }
        },
      ),
    );
  });

  it("indexes cross-school pairs from ten matches, in either order", () => {
    expect(
      crossSchoolIndex([
        { a: "isg", b: "epita", count: 6 },
        { a: "epita", b: "isg", count: 7 },
        { a: "epita", b: "epita", count: 40 },
        { a: "esme", b: "ipsa", count: 9 },
        { a: "ipsa", b: "supbiotech", count: 21 },
      ]),
    ).toEqual([
      { a: "ipsa", b: "supbiotech", count: 21 },
      { a: "epita", b: "isg", count: 13 },
    ]);
  });
});

describe("badges (COM-04)", () => {
  it("makes founders of early members and shows granted badges, in a fixed order", () => {
    const early = new Date("2026-11-01T10:00:00Z");
    const late = new Date("2027-03-01T10:00:00Z");
    expect(badgesOf({ createdAt: early, granted: new Set() })).toEqual(["founder"]);
    expect(badgesOf({ createdAt: late, granted: new Set(["ambassador", "photo_verified"]) })).toEqual([
      "photo_verified",
      "ambassador",
    ]);
    expect(badgesOf({ createdAt: late, granted: new Set(["most_liked"]) })).toEqual([]);
  });
});

describe("Dispo status (IRL-05)", () => {
  const now = new Date("2026-10-02T12:00:00Z");
  it("lasts between a quarter of an hour and twelve hours", () => {
    expect(checkAvailability(new Date("2026-10-02T14:00:00Z"), now)).toEqual({ ok: true });
    expect(checkAvailability(new Date("2026-10-02T12:10:00Z"), now)).toEqual({
      ok: false,
      reason: "too_short",
    });
    expect(checkAvailability(new Date("2026-10-03T01:00:00Z"), now)).toEqual({
      ok: false,
      reason: "too_long",
    });
  });

  it("disappears when it expires or when the member pauses", () => {
    const until = new Date("2026-10-02T14:00:00Z");
    expect(availabilityShown({ until }, { status: "active" }, now)).toBe(true);
    expect(availabilityShown({ until }, { status: "paused" }, now)).toBe(false);
    expect(availabilityShown({ until }, { status: "active" }, until)).toBe(false);
    expect(availabilityShown(null, { status: "active" }, now)).toBe(false);
  });
});
