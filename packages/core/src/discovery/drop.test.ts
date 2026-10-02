import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { testMember } from "../policies/testing";
import {
  addDays,
  assignDrops,
  campusInstant,
  DROP_RULES,
  dropDayAt,
  dropSchedule,
  dropWindow,
  nextDropAt,
} from "./drop";
import { matchesDeckFilter } from "./filter";

const PARIS = "Europe/Paris";

describe("Drop calendar", () => {
  it("places 21:00 on the campus clock, across daylight saving time", () => {
    expect(campusInstant("2026-10-24", 21, 0, PARIS).toISOString()).toBe("2026-10-24T19:00:00.000Z");
    expect(campusInstant("2026-10-25", 21, 0, PARIS).toISOString()).toBe("2026-10-25T20:00:00.000Z");
    expect(campusInstant("2027-03-28", 21, 0, PARIS).toISOString()).toBe("2027-03-28T19:00:00.000Z");
  });

  it("serves yesterday's Drop until 21:00, then today's for 24 hours", () => {
    expect(dropDayAt(new Date("2026-10-02T18:59:59Z"), PARIS)).toBe("2026-10-01");
    expect(dropDayAt(new Date("2026-10-02T19:00:00Z"), PARIS)).toBe("2026-10-02");
    expect(dropDayAt(new Date("2026-10-02T23:30:00Z"), PARIS)).toBe("2026-10-02");
    expect(dropWindow("2026-10-24", PARIS)).toEqual({
      publishedAt: new Date("2026-10-24T19:00:00Z"),
      expiresAt: new Date("2026-10-25T20:00:00Z"),
    });
    expect(nextDropAt(new Date("2026-10-02T12:00:00Z"), PARIS).toISOString()).toBe(
      "2026-10-02T19:00:00.000Z",
    );
    expect(nextDropAt(new Date("2026-10-02T19:00:00Z"), PARIS).toISOString()).toBe(
      "2026-10-03T19:00:00.000Z",
    );
  });

  it("computes at 20:30 and publishes at 21:00", () => {
    expect(dropSchedule(new Date("2026-10-02T18:29:00Z"), PARIS)).toEqual({
      day: "2026-10-02",
      computeDue: false,
      publishDue: false,
    });
    expect(dropSchedule(new Date("2026-10-02T18:30:00Z"), PARIS)).toMatchObject({
      computeDue: true,
      publishDue: false,
    });
    expect(dropSchedule(new Date("2026-10-02T19:00:00Z"), PARIS)).toMatchObject({
      computeDue: true,
      publishDue: true,
    });
  });

  it("adds days across months and years", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2027-03-01", -1)).toBe("2027-02-28");
  });
});

describe("assignDrops", () => {
  const pairArb = fc.array(
    fc.record({
      viewer: fc.integer({ min: 0, max: 12 }).map((i) => `v${i}`),
      candidate: fc.integer({ min: 0, max: 12 }).map((i) => `v${i}`),
      score: fc.double({ min: 0, max: 1, noNaN: true }),
    }),
    { maxLength: 200 },
  );

  it("respects the Drop size and the appearance cap, with offered pairs only", () => {
    fc.assert(
      fc.property(
        pairArb,
        fc.integer({ min: 1, max: 6 }),
        fc.integer({ min: 1, max: 4 }),
        (pairs, size, cap) => {
          const drops = assignDrops(pairs, { size, maxAppearances: cap });
          const offered = new Set(pairs.map((p) => `${p.viewer}>${p.candidate}`));
          const appearances = new Map<string, number>();
          for (const [viewer, candidates] of drops) {
            expect(candidates.length).toBeLessThanOrEqual(size);
            expect(new Set(candidates).size).toBe(candidates.length);
            for (const candidate of candidates) {
              expect(candidate).not.toBe(viewer);
              expect(offered.has(`${viewer}>${candidate}`)).toBe(true);
              appearances.set(candidate, (appearances.get(candidate) ?? 0) + 1);
            }
          }
          for (const count of appearances.values()) {
            expect(count).toBeLessThanOrEqual(cap);
          }
          // Maximal: no left-over pair could still be added.
          for (const p of pairs) {
            const drop = drops.get(p.viewer) ?? [];
            if (p.viewer !== p.candidate && !drop.includes(p.candidate)) {
              expect(drop.length >= size || (appearances.get(p.candidate) ?? 0) >= cap).toBe(true);
            }
          }
        },
      ),
    );
  });

  it("gives the best pairs first and spreads popular profiles", () => {
    const pairs = ["a", "b", "c"].flatMap((viewer) => [
      { viewer, candidate: "star", score: 0.99 },
      { viewer, candidate: `other-${viewer}`, score: 0.5 },
    ]);
    const drops = assignDrops(pairs, { size: 1, maxAppearances: 2 });
    expect(drops.get("a")).toEqual(["star"]);
    expect(drops.get("b")).toEqual(["star"]);
    expect(drops.get("c")).toEqual(["other-c"]);
    expect(DROP_RULES.size).toBe(5);
  });
});

describe("matchesDeckFilter", () => {
  const target = {
    member: testMember({ id: "t", schoolSlug: "isg", graduationYear: 2028 }),
    intentions: ["friendship"],
  };
  const none = {
    mode: "all" as const,
    schoolSlugs: [],
    graduationYears: [],
    intentions: [],
    ageMin: null,
    ageMax: null,
  };

  it("lets everyone through without filters and applies each criterion", () => {
    expect(matchesDeckFilter(none, target, ["friends"], "2026-10-02")).toBe(true);
    expect(matchesDeckFilter({ ...none, mode: "love" }, target, ["friends"], "2026-10-02")).toBe(false);
    expect(matchesDeckFilter({ ...none, schoolSlugs: ["epita"] }, target, ["friends"], "2026-10-02")).toBe(
      false,
    );
    expect(matchesDeckFilter({ ...none, graduationYears: [2028] }, target, ["friends"], "2026-10-02")).toBe(
      true,
    );
    expect(
      matchesDeckFilter({ ...none, intentions: ["relationship"] }, target, ["friends"], "2026-10-02"),
    ).toBe(false);
    expect(matchesDeckFilter({ ...none, ageMin: 25 }, target, ["friends"], "2026-10-02")).toBe(false);
  });
});
