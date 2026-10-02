import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  type AnswerSheet,
  compatibility,
  IMPORTANCE_WEIGHTS,
  type Importance,
  violatesDealbreaker,
} from "../matching/compatibility";
import { TEST_TODAY, testMember, testRelations } from "../policies/testing";
import type { PolicyContext } from "../policies/types";
import { clockOffsetMs, countdown, revealDelayMs } from "./clock";
import {
  BestNeighbours,
  buildPactEdges,
  compileSheets,
  fastCompatibility,
  type PactParticipant,
  pactEligibleModes,
} from "./edges";
import { MIN_GROUP_SIZE, pactModeReport } from "./report";
import { canComputePact, canJoinPact, canViewPactResult, pactPhase } from "./rules";
import { sectionScores } from "./sections";

const OPTIONS = ["a", "b", "c", "d"] as const;
const IMPORTANCES = Object.keys(IMPORTANCE_WEIGHTS) as Importance[];

const answerArb = fc.record({
  answer: fc.constantFrom(...OPTIONS),
  acceptable: fc.subarray([...OPTIONS]).map((values) => new Set<string>(values)),
  importance: fc.constantFrom(...IMPORTANCES),
});

const sheetArb = fc
  .dictionary(fc.integer({ min: 0, max: 40 }).map(String), answerArb, { maxKeys: 40 })
  .map((record) => new Map(Object.entries(record)) as AnswerSheet);

/** Everyone answers the same 20 questions the same way: compatibility 0.95. */
function agreeableSheet(answer = "a"): AnswerSheet {
  return new Map(
    Array.from({ length: 20 }, (_, q) => [
      `q${q}`,
      { answer, acceptable: new Set([answer]), importance: "very" as const },
    ]),
  );
}

const context = (relations = testRelations()): PolicyContext => ({ today: TEST_TODAY, relations });

const participant = (id: string, overrides: Partial<PactParticipant> = {}): PactParticipant => ({
  member: testMember({ id }),
  modes: ["love", "friends"],
  answers: agreeableSheet(),
  ...overrides,
});

describe("fastCompatibility", () => {
  it("gives exactly the same results as compatibility and violatesDealbreaker", () => {
    fc.assert(
      fc.property(sheetArb, sheetArb, fc.integer({ min: 1, max: 15 }), (a, b, minCommon) => {
        const [ca, cb] = compileSheets([a, b]);
        const fast = fastCompatibility(ca as never, cb as never, minCommon);
        expect(fast.score).toBe(compatibility(a, b, minCommon)?.score ?? null);
        expect(fast.dealbreaker).toBe(violatesDealbreaker(a, b));
      }),
      { numRuns: 500 },
    );
  });

  it("refuses questions with too many options for a bit mask", () => {
    const sheet: AnswerSheet = new Map([
      [
        "q",
        {
          answer: "o0",
          acceptable: new Set(Array.from({ length: 32 }, (_, i) => `o${i}`)),
          importance: "little",
        },
      ],
    ]);
    expect(() => compileSheets([sheet])).toThrow();
  });
});

describe("pactEligibleModes", () => {
  it("pairs two participants in the modes they both joined", () => {
    const a = participant("a", { modes: ["love"] });
    const b = participant("b");
    expect(pactEligibleModes(a, b, context())).toEqual(["love"]);
  });

  it("lifts incognito: joining the Pact is consent to meet one's match", () => {
    const a = participant("a", { member: testMember({ id: "a", incognito: true }) });
    expect(pactEligibleModes(a, participant("b"), context())).toEqual(["love", "friends"]);
  });

  it("keeps every other discovery rule, in both directions", () => {
    const b = participant("b");
    expect(pactEligibleModes(participant("a"), b, context(testRelations({ blocks: [["b", "a"]] })))).toEqual(
      [],
    );
    expect(pactEligibleModes(participant("a"), b, context(testRelations({ ended: [["a", "b"]] })))).toEqual(
      [],
    );
    const paused = participant("a", { member: testMember({ id: "a", status: "paused" }) });
    expect(pactEligibleModes(b, paused, context())).toEqual([]);
    const minor = participant("a", { member: testMember({ id: "a", birthDate: "2010-01-01" }) });
    expect(pactEligibleModes(minor, b, context())).toEqual([]);
  });

  it("skips pairs who already matched", () => {
    const relations = testRelations({ matches: [["a", "b"]] });
    expect(pactEligibleModes(participant("a"), participant("b"), context(relations))).toEqual([]);
  });

  it("only pairs for love when the attraction is mutual", () => {
    const a = participant("a", { member: testMember({ id: "a", gender: "man", interestedIn: ["woman"] }) });
    const b = participant("b", { member: testMember({ id: "b", gender: "man", interestedIn: ["man"] }) });
    expect(pactEligibleModes(a, b, context())).toEqual(["friends"]);
  });
});

describe("buildPactEdges", () => {
  it("keeps eligible pairs above the threshold, ordered", () => {
    const edges = buildPactEdges(
      [participant("c"), participant("a"), participant("b", { answers: agreeableSheet("b") })],
      context(),
    );
    expect(edges).toEqual([
      { mode: "love", a: "a", b: "c", score: 0.95 },
      { mode: "friends", a: "a", b: "c", score: 0.95 },
    ]);
  });

  it("drops pairs with a dealbreaker even when the score is high", () => {
    const strict: AnswerSheet = new Map([
      ...agreeableSheet(),
      ["deal", { answer: "a", acceptable: new Set(["a"]), importance: "mandatory" as const }],
    ]);
    const other: AnswerSheet = new Map([
      ...agreeableSheet(),
      ["deal", { answer: "b", acceptable: new Set(["a", "b"]), importance: "little" as const }],
    ]);
    const edges = buildPactEdges(
      [participant("a", { answers: strict }), participant("b", { answers: other })],
      context(),
      { threshold: 0 },
    );
    expect(edges).toEqual([]);
  });

  it("drops pairs without enough common questions", () => {
    const few: AnswerSheet = new Map([...agreeableSheet()].slice(0, 5));
    expect(buildPactEdges([participant("a", { answers: few }), participant("b")], context())).toEqual([]);
  });
});

describe("BestNeighbours", () => {
  const graphArb = fc
    .array(
      fc.record({
        a: fc.integer({ min: 0, max: 14 }),
        b: fc.integer({ min: 0, max: 14 }),
        score: fc.integer({ min: 60, max: 100 }).map((s) => s / 100),
      }),
      { maxLength: 80 },
    )
    .map((raw) => {
      const seen = new Map<string, { a: string; b: string; score: number }>();
      for (const { a, b, score } of raw) {
        if (a !== b) {
          const [x, y] = [
            `m${String(Math.min(a, b)).padStart(2, "0")}`,
            `m${String(Math.max(a, b)).padStart(2, "0")}`,
          ];
          seen.set(`${x}|${y}`, { a: x, b: y, score });
        }
      }
      return [...seen.values()];
    });

  /** Reference implementation: sort each member's edges and keep the first k. */
  function naive(edges: { a: string; b: string; score: number }[], k: number) {
    const incident = new Map<string, { other: string; score: number; key: string }[]>();
    for (const edge of edges) {
      const key = `${edge.a}|${edge.b}`;
      for (const [member, other] of [
        [edge.a, edge.b],
        [edge.b, edge.a],
      ] as const) {
        incident.set(member, [...(incident.get(member) ?? []), { other, score: edge.score, key }]);
      }
    }
    const kept = new Set<string>();
    for (const items of incident.values()) {
      items.sort((x, y) => y.score - x.score || (x.other < y.other ? -1 : 1));
      for (const item of items.slice(0, k)) {
        kept.add(item.key);
      }
    }
    return edges.filter((edge) => kept.has(`${edge.a}|${edge.b}`));
  }

  const run = (edges: { a: string; b: string; score: number }[], k: number) => {
    const best = new BestNeighbours(k);
    for (const edge of edges) {
      best.offer(edge.a, edge.b, edge.score);
    }
    return best.edges();
  };

  it("keeps the same edges as sorting every member's neighbours", () => {
    fc.assert(
      fc.property(graphArb, fc.integer({ min: 1, max: 6 }), (edges, k) => {
        const sorted = (list: { a: string; b: string }[]) => list.map((e) => `${e.a}|${e.b}`).sort();
        expect(sorted(run(edges, k))).toEqual(sorted(naive(edges, k)));
      }),
    );
  });

  it("is idempotent and leaves everyone at least min(k, degree) edges", () => {
    fc.assert(
      fc.property(graphArb, fc.integer({ min: 1, max: 6 }), (edges, k) => {
        const once = run(edges, k);
        expect(run(once, k)).toEqual(once);
        const degree = (list: { a: string; b: string }[], member: string) =>
          list.filter((e) => e.a === member || e.b === member).length;
        for (const member of new Set(edges.flatMap((e) => [e.a, e.b]))) {
          expect(degree(once, member)).toBeGreaterThanOrEqual(Math.min(k, degree(edges, member)));
        }
      }),
    );
  });
});

describe("pact phases", () => {
  const season = {
    status: "open" as const,
    opensAt: new Date("2027-02-01T08:00:00Z"),
    closesAt: new Date("2027-02-10T22:00:00Z"),
    revealAt: new Date("2027-02-14T19:00:00Z"),
  };
  const at = (iso: string) => new Date(iso);

  it("follows the season's dates and status", () => {
    expect(pactPhase(season, at("2027-01-31T00:00:00Z"))).toBe("upcoming");
    expect(pactPhase(season, at("2027-02-05T00:00:00Z"))).toBe("open");
    expect(pactPhase(season, at("2027-02-11T00:00:00Z"))).toBe("closed");
    expect(pactPhase({ ...season, status: "computed" }, at("2027-02-14T19:00:01Z"))).toBe("revealing");
    expect(pactPhase({ ...season, status: "revealed" }, at("2027-02-14T19:00:01Z"))).toBe("revealed");
    expect(pactPhase({ ...season, status: "draft" }, at("2027-02-05T00:00:00Z"))).toBe("upcoming");
    expect(pactPhase({ ...season, status: "closed" }, at("2027-02-05T00:00:00Z"))).toBe("closed");
  });

  it("only lets members join while open, and see results once revealed", () => {
    expect(canJoinPact(season, at("2027-02-05T00:00:00Z"))).toBe(true);
    expect(canJoinPact(season, at("2027-02-10T22:00:00Z"))).toBe(false);
    const revealed = { ...season, status: "revealed" as const };
    expect(canViewPactResult(season, at("2027-02-14T19:00:01Z"), true)).toBe(false);
    expect(canViewPactResult(revealed, at("2027-02-14T19:00:01Z"), true)).toBe(true);
    expect(canViewPactResult(revealed, at("2027-02-14T19:00:01Z"), false)).toBe(false);
  });

  it("computes between closing and reveal only", () => {
    expect(canComputePact(season, at("2027-02-05T00:00:00Z"))).toBe(false);
    expect(canComputePact(season, at("2027-02-12T00:00:00Z"))).toBe(true);
    expect(canComputePact({ ...season, status: "computed" }, at("2027-02-12T00:00:00Z"))).toBe(true);
    expect(canComputePact(season, at("2027-02-14T19:00:00Z"))).toBe(false);
    expect(canComputePact({ ...season, status: "revealed" }, at("2027-02-12T00:00:00Z"))).toBe(false);
  });
});

describe("countdown clock", () => {
  it("estimates the server offset from the round trip midpoint", () => {
    expect(clockOffsetMs(1000, 1200, 5100)).toBe(4000);
  });

  it("splits the remaining time and stops at zero", () => {
    expect(countdown(90_061_000)).toEqual({ days: 1, hours: 1, minutes: 1, seconds: 1, done: false });
    expect(countdown(400)).toEqual({ days: 0, hours: 0, minutes: 0, seconds: 1, done: false });
    expect(countdown(-5)).toEqual({ days: 0, hours: 0, minutes: 0, seconds: 0, done: true });
  });

  it("spreads result requests over the jitter window", () => {
    fc.assert(
      fc.property(fc.double({ min: -1, max: 2, noNaN: true }), (random) => {
        const delay = revealDelayMs(random, 3000);
        expect(delay).toBeGreaterThanOrEqual(0);
        expect(delay).toBeLessThan(3000);
      }),
    );
  });
});

describe("sectionScores", () => {
  it("scores each section on its common questions and skips thin ones", () => {
    const sectionOf = new Map([
      ["q0", "values"],
      ["q1", "values"],
      ["q2", "nerd"],
    ]);
    const a = agreeableSheet();
    const b: AnswerSheet = new Map(
      [...agreeableSheet()].map(([id, answer]) => [id, id === "q1" ? { ...answer, answer: "b" } : answer]),
    );
    expect(sectionScores(a, b, sectionOf, ["values", "nerd", "plans"])).toEqual([
      { section: "values", score: 0.71 },
      { section: "nerd", score: null },
      { section: "plans", score: null },
    ]);
  });
});

describe("pactModeReport", () => {
  const schools = ["epita", "esme", "isg"];
  const participants = Array.from({ length: 30 }, (_, i) => ({
    id: `0198a3f0-0000-7000-8000-${String(i).padStart(12, "0")}`,
    schoolSlug: schools[i < 24 ? i % 2 : 2] as string,
    graduationYear: 2028 + (i % 3),
  }));
  const pairs = Array.from({ length: 12 }, (_, i) => ({
    a: participants[2 * i]?.id as string,
    b: participants[2 * i + 1]?.id as string,
    score: 0.6 + i / 30,
    sections: [],
  }));

  it("summarises the matching without any identifier", () => {
    const report = pactModeReport(
      { mode: "love", participants, pairs, solver: { engine: "networkx" } },
      { threshold: 0.6, sampleSize: 5, random: () => 0.5 },
    );
    expect(report.participants).toBe(30);
    expect(report.pairs).toBe(12);
    expect(report.coverage).toBe(0.8);
    expect(report.crossSchoolShare).toBe(1);
    expect(report.histogram.reduce((sum, band) => sum + band.count, 0)).toBe(12);
    expect(report.sample).toHaveLength(5);
    const json = JSON.stringify(report);
    for (const p of participants) {
      expect(json).not.toContain(p.id);
    }
  });

  it("does not break down groups smaller than the anonymity threshold", () => {
    const report = pactModeReport(
      { mode: "friends", participants, pairs, solver: {} },
      { threshold: 0.6, random: () => 0 },
    );
    const small = report.bySchool.find((s) => s.school === "isg");
    expect(participants.filter((p) => p.schoolSlug === "isg").length).toBeLessThan(MIN_GROUP_SIZE);
    expect(small).toEqual({ school: "isg", participants: null, matched: null });
    expect(report.bySchool.find((s) => s.school === "epita")?.participants).toBe(12);
  });
});
