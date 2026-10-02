import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  exposureFactor,
  jaccard,
  type RankingCandidate,
  type RankingSelf,
  rankDeck,
  rankingScore,
} from "./ranking";

const self: RankingSelf = {
  id: "me",
  schoolSlug: "epita",
  graduationYear: 2029,
  crossSchoolBoost: true,
  completeness: 0.8,
  daysSinceActive: 0,
};

const candidate = (
  overrides: Partial<RankingCandidate> & Pick<RankingCandidate, "id">,
): RankingCandidate => ({
  schoolSlug: "isg",
  graduationYear: 2029,
  compatibility: 0.7,
  interestSimilarity: 0.2,
  completeness: 0.8,
  daysSinceActive: 1,
  accountAgeHours: 1000,
  pendingLikesReceived: 0,
  impressionsToday: 0,
  likedViewer: false,
  ...overrides,
});

const candidateArb = fc.record({
  id: fc.uuid(),
  schoolSlug: fc.constantFrom("epita", "esme", "isg", "ipsa", "supbiotech"),
  graduationYear: fc.integer({ min: 2027, max: 2031 }),
  compatibility: fc.option(fc.double({ min: 0, max: 1, noNaN: true }), { nil: null }),
  interestSimilarity: fc.double({ min: 0, max: 1, noNaN: true }),
  completeness: fc.double({ min: 0, max: 1, noNaN: true }),
  daysSinceActive: fc.integer({ min: 0, max: 21 }),
  accountAgeHours: fc.integer({ min: 0, max: 5000 }),
  pendingLikesReceived: fc.nat(60),
  impressionsToday: fc.nat(200),
  likedViewer: fc.boolean(),
});

describe("rankingScore", () => {
  it("prefers more compatible members, all else equal", () => {
    fc.assert(
      fc.property(candidateArb, fc.double({ min: 0, max: 0.5, noNaN: true }), (c, delta) => {
        const low = { ...c, compatibility: 0.4 };
        const high = { ...c, compatibility: 0.4 + delta };
        expect(rankingScore(self, high)).toBeGreaterThanOrEqual(rankingScore(self, low));
      }),
    );
  });

  it("calms down the exposure of swamped or over-exposed members", () => {
    expect(exposureFactor({ pendingLikesReceived: 5, impressionsToday: 10 })).toBe(1);
    expect(exposureFactor({ pendingLikesReceived: 30, impressionsToday: 10 })).toBeLessThan(0.5);
    expect(exposureFactor({ pendingLikesReceived: 0, impressionsToday: 120 })).toBeLessThan(0.2);
  });

  it("gives a cross-school bonus only when the viewer wants it", () => {
    const sameSchool = candidate({ id: "a", schoolSlug: "epita" });
    const otherSchool = candidate({ id: "b", schoolSlug: "isg" });
    expect(rankingScore(self, otherSchool)).toBeGreaterThan(rankingScore(self, sameSchool));
    const noBoost = { ...self, crossSchoolBoost: false };
    expect(rankingScore(noBoost, otherSchool)).toBeCloseTo(rankingScore(noBoost, sameSchool));
  });

  it("stays positive and finite", () => {
    fc.assert(
      fc.property(candidateArb, (c) => {
        const score = rankingScore(self, c);
        expect(Number.isFinite(score)).toBe(true);
        expect(score).toBeGreaterThan(0);
      }),
    );
  });
});

describe("rankDeck", () => {
  it("returns every candidate exactly once", () => {
    fc.assert(
      fc.property(fc.uniqueArray(candidateArb, { selector: (c) => c.id, maxLength: 40 }), (candidates) => {
        const deck = rankDeck(self, candidates);
        expect(deck.map((d) => d.id).sort()).toEqual(candidates.map((c) => c.id).sort());
      }),
    );
  });

  it("puts a member who liked the viewer about every fourth card", () => {
    const candidates = [
      ...Array.from({ length: 12 }, (_, i) => candidate({ id: `o${i}`, compatibility: 0.9 })),
      ...Array.from({ length: 3 }, (_, i) =>
        candidate({ id: `l${i}`, compatibility: 0.1, likedViewer: true }),
      ),
    ];
    const deck = rankDeck(self, candidates);
    expect(deck.map((d) => d.likedViewer)).toEqual([
      false,
      false,
      false,
      true,
      false,
      false,
      false,
      true,
      false,
      false,
      false,
      true,
      false,
      false,
      false,
    ]);
  });

  it("avoids long runs from the same school and year when alternatives exist", () => {
    const candidates = [
      ...Array.from({ length: 6 }, (_, i) =>
        candidate({ id: `e${i}`, schoolSlug: "esme", compatibility: 0.8 }),
      ),
      ...Array.from({ length: 6 }, (_, i) =>
        candidate({ id: `s${i}`, schoolSlug: "supbiotech", graduationYear: 2028, compatibility: 0.78 }),
      ),
    ];
    const schools = rankDeck(self, candidates).map((d) => d.id[0]);
    const longestRun = schools.reduce(
      (acc, school, i) => {
        const run = i > 0 && schools[i - 1] === school ? acc.run + 1 : 1;
        return { run, max: Math.max(acc.max, run) };
      },
      { run: 0, max: 0 },
    ).max;
    expect(longestRun).toBeLessThanOrEqual(2);
  });
});

describe("jaccard", () => {
  it("measures overlap", () => {
    expect(jaccard(new Set(["a", "b"]), new Set(["b", "c"]))).toBeCloseTo(1 / 3);
    expect(jaccard(new Set(), new Set())).toBe(0);
  });
});
