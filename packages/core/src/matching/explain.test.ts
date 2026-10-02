import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { AnswerSheet, Importance, QuestionAnswer } from "./compatibility";
import { explainCompatibility } from "./explain";

const answer = (
  value: string,
  importance: Importance = "somewhat",
  acceptable = [value],
): QuestionAnswer => ({
  answer: value,
  acceptable: new Set(acceptable),
  importance,
});
const sheet = (entries: Record<string, QuestionAnswer>): AnswerSheet => new Map(Object.entries(entries));

describe("explainCompatibility", () => {
  it("keeps the two most important shared answers", () => {
    const a = sheet({
      q1: answer("x", "little"),
      q2: answer("y", "very"),
      q3: answer("z", "mandatory"),
      q4: answer("w"),
    });
    const b = sheet({
      q1: answer("x", "little"),
      q2: answer("y", "somewhat"),
      q3: answer("z", "very"),
      q4: answer("v"),
    });
    const { agreements } = explainCompatibility(a, b);
    expect(agreements.map((g) => g.questionId)).toEqual(["q3", "q2"]);
  });

  it("picks a harmless disagreement, preferring playful questions", () => {
    const a = sheet({
      serious: answer("a", "little"),
      pizza: answer("yes", "little"),
      money: answer("save", "very"),
    });
    const b = sheet({
      serious: answer("b", "little"),
      pizza: answer("no", "somewhat"),
      money: answer("spend", "very"),
    });
    expect(explainCompatibility(a, b, { playfulQuestionIds: new Set(["pizza"]) }).quirk).toEqual({
      questionId: "pizza",
      viewerAnswer: "yes",
      otherAnswer: "no",
    });
    // A disagreement that matters to someone is never turned into a joke.
    expect(
      explainCompatibility(
        sheet({ money: a.get("money") as QuestionAnswer }),
        sheet({ money: b.get("money") as QuestionAnswer }),
      ).quirk,
    ).toBeNull();
  });

  it("ignores agreements nobody cares about and questions answered by one side only", () => {
    const a = sheet({ q1: answer("x", "irrelevant"), q2: answer("y") });
    const b = sheet({ q1: answer("x", "irrelevant") });
    expect(explainCompatibility(a, b)).toEqual({ agreements: [], quirk: null });
  });

  it("only ever cites common questions with identical answers", () => {
    const value = fc.constantFrom("a", "b", "c");
    const importance = fc.constantFrom<Importance>("irrelevant", "little", "somewhat", "very", "mandatory");
    const sheetArb = fc
      .dictionary(fc.constantFrom("q1", "q2", "q3", "q4", "q5"), fc.record({ value, importance }))
      .map((entries) => new Map(Object.entries(entries).map(([q, e]) => [q, answer(e.value, e.importance)])));
    fc.assert(
      fc.property(sheetArb, sheetArb, (a, b) => {
        const { agreements, quirk } = explainCompatibility(a, b);
        expect(agreements.length).toBeLessThanOrEqual(2);
        for (const g of agreements) {
          expect(a.get(g.questionId)?.answer).toBe(g.answer);
          expect(b.get(g.questionId)?.answer).toBe(g.answer);
        }
        if (quirk) {
          expect(a.get(quirk.questionId)?.answer).toBe(quirk.viewerAnswer);
          expect(b.get(quirk.questionId)?.answer).toBe(quirk.otherAnswer);
          expect(quirk.viewerAnswer).not.toBe(quirk.otherAnswer);
        }
      }),
    );
  });
});
