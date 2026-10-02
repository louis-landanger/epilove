import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  collectiveGoalProgress,
  rankSchoolRace,
  SCHOOL_HEADCOUNT_ESTIMATES,
  WAITLIST_COLLECTIVE_GOAL,
} from "./headcounts";
import { SCHOOL_SLUGS, type SchoolSlug } from "./schools";

const counts = fc.record(
  Object.fromEntries(SCHOOL_SLUGS.map((slug) => [slug, fc.nat({ max: 2000 })])) as Record<
    SchoolSlug,
    fc.Arbitrary<number>
  >,
);

describe("rankSchoolRace", () => {
  it("ranks by share of headcount, not by absolute numbers", () => {
    const race = rankSchoolRace(
      { epita: 100, esme: 90, supbiotech: 60, isg: 110, ipsa: 10 },
      { epita: 400, esme: 450, supbiotech: 250, isg: 500, ipsa: 150 },
    );
    expect(race.map((entry) => entry.slug)).toEqual(["epita", "supbiotech", "isg", "esme", "ipsa"]);
    expect(race[0]).toEqual({ slug: "epita", count: 100, headcount: 400, share: 0.25, rank: 1 });
    // ISG has the most sign-ups but a smaller share than Sup'Biotech.
    expect(race.find((entry) => entry.slug === "isg")?.rank).toBe(3);
  });

  it("gives equal shares the same rank and keeps the schools order for ties", () => {
    const race = rankSchoolRace(
      { epita: 40, esme: 0, supbiotech: 25, isg: 0, ipsa: 0 },
      { epita: 400, esme: 450, supbiotech: 250, isg: 500, ipsa: 150 },
    );
    expect(race.map((entry) => [entry.slug, entry.rank])).toEqual([
      ["epita", 1],
      ["supbiotech", 1],
      ["esme", 3],
      ["isg", 3],
      ["ipsa", 3],
    ]);
  });

  it("treats missing schools as zero and uses the estimates by default", () => {
    const race = rankSchoolRace({ ipsa: 3 });
    expect(race[0]).toMatchObject({ slug: "ipsa", count: 3, headcount: SCHOOL_HEADCOUNT_ESTIMATES.ipsa });
    expect(race.slice(1).every((entry) => entry.count === 0 && entry.rank === 2)).toBe(true);
  });

  it("refuses impossible counts", () => {
    expect(() => rankSchoolRace({ epita: -1 })).toThrow(RangeError);
    expect(() => rankSchoolRace({ epita: 1.5 })).toThrow(RangeError);
    expect(() => rankSchoolRace({}, { ...SCHOOL_HEADCOUNT_ESTIMATES, isg: 0 })).toThrow(RangeError);
  });

  it("always lists every school once, sorted by share, with consistent ranks", () => {
    fc.assert(
      fc.property(counts, (input) => {
        const race = rankSchoolRace(input);
        expect(race.map((entry) => entry.slug).sort()).toEqual([...SCHOOL_SLUGS].sort());
        race.forEach((entry, index) => {
          expect(entry.share).toBeCloseTo(entry.count / entry.headcount, 12);
          if (index === 0) {
            expect(entry.rank).toBe(1);
            return;
          }
          const previous = race[index - 1];
          if (!previous) {
            return;
          }
          expect(previous.share).toBeGreaterThanOrEqual(entry.share);
          const tied = previous.count * entry.headcount === entry.count * previous.headcount;
          expect(entry.rank).toBe(tied ? previous.rank : index + 1);
        });
      }),
    );
  });
});

describe("collectiveGoalProgress", () => {
  it("measures the progress towards the collective goal", () => {
    expect(collectiveGoalProgress(250)).toEqual({
      total: 250,
      goal: WAITLIST_COLLECTIVE_GOAL,
      ratio: 0.25,
      remaining: 750,
      reached: false,
    });
  });

  it("caps the ratio once the goal is reached", () => {
    expect(collectiveGoalProgress(1200, 1000)).toMatchObject({ ratio: 1, remaining: 0, reached: true });
  });

  it("refuses impossible values", () => {
    expect(() => collectiveGoalProgress(-1)).toThrow(RangeError);
    expect(() => collectiveGoalProgress(10, 0)).toThrow(RangeError);
  });
});
