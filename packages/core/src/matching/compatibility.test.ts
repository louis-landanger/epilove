import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  type AnswerSheet,
  compatibility,
  IMPORTANCE_WEIGHTS,
  type Importance,
  type QuestionAnswer,
  satisfaction,
  violatesDealbreaker,
} from "./compatibility";

const OPTIONS = ["a", "b", "c", "d"] as const;

function sheet(entries: Array<[string, QuestionAnswer]>): AnswerSheet {
  return new Map(entries);
}

function uniformSheet(count: number, answer: string, accepts: string[], importance: Importance): AnswerSheet {
  return sheet(
    Array.from({ length: count }, (_, index) => [
      `q${index}`,
      { answer, acceptable: new Set(accepts), importance },
    ]),
  );
}

const answerArb = fc.record({
  answer: fc.constantFrom(...OPTIONS),
  acceptable: fc.subarray([...OPTIONS]).map((values) => new Set<string>(values)),
  importance: fc.constantFrom(...(Object.keys(IMPORTANCE_WEIGHTS) as Importance[])),
});

const sheetArb = fc
  .dictionary(fc.integer({ min: 0, max: 30 }).map(String), answerArb, { maxKeys: 30 })
  .map((record) => new Map(Object.entries(record)) as AnswerSheet);

describe("compatibility", () => {
  it("returns null below the minimum number of common questions", () => {
    const a = uniformSheet(11, "a", ["a"], "very");
    expect(compatibility(a, a)).toBeNull();
  });

  it("gives a perfect match minus the margin of error", () => {
    const a = uniformSheet(20, "a", ["a"], "very");
    expect(compatibility(a, a)).toEqual({ score: 1 - 1 / 20, commonQuestions: 20 });
  });

  it("gives 0 when nobody accepts the other's answers", () => {
    const a = uniformSheet(20, "a", ["a"], "very");
    const b = uniformSheet(20, "b", ["b"], "very");
    expect(compatibility(a, b)?.score).toBe(0);
  });

  it("weights answers by importance", () => {
    const a = sheet([
      ["q1", { answer: "a", acceptable: new Set(["a"]), importance: "mandatory" }],
      ["q2", { answer: "a", acceptable: new Set(["a"]), importance: "little" }],
    ]);
    const b = sheet([
      ["q1", { answer: "a", acceptable: new Set(["a"]), importance: "little" }],
      ["q2", { answer: "b", acceptable: new Set(["b"]), importance: "little" }],
    ]);
    expect(satisfaction(a, b, ["q1", "q2"])).toBeCloseTo(250 / 251);
  });

  it("is symmetric and bounded", () => {
    fc.assert(
      fc.property(sheetArb, sheetArb, (a, b) => {
        const ab = compatibility(a, b, 1);
        const ba = compatibility(b, a, 1);
        expect(ab).toEqual(ba);
        if (ab) {
          expect(ab.score).toBeGreaterThanOrEqual(0);
          expect(ab.score).toBeLessThanOrEqual(1);
        }
      }),
    );
  });
});

describe("violatesDealbreaker", () => {
  it("detects an unacceptable answer to a mandatory question, in both directions", () => {
    const strict = sheet([["q1", { answer: "a", acceptable: new Set(["a"]), importance: "mandatory" }]]);
    const relaxed = sheet([["q1", { answer: "b", acceptable: new Set(["a", "b"]), importance: "little" }]]);
    expect(violatesDealbreaker(strict, relaxed)).toBe(true);
    expect(violatesDealbreaker(relaxed, strict)).toBe(true);
  });

  it("ignores questions only one person answered", () => {
    const strict = sheet([["q1", { answer: "a", acceptable: new Set(["a"]), importance: "mandatory" }]]);
    const other = sheet([["q2", { answer: "b", acceptable: new Set(["b"]), importance: "mandatory" }]]);
    expect(violatesDealbreaker(strict, other)).toBe(false);
  });
});
