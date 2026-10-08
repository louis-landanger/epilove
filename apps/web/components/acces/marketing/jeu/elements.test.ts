import { describe, expect, it } from "vitest";
import { PEOPLE } from "../match/people";
import { type Answers, elementFor, isComplete, matchFor, QUESTIONS } from "./elements";

/** Every possible set of answers. */
function everyAnswer(): Answers[] {
  const all: Answers[] = [];
  for (let spot = 0; spot < QUESTIONS.spot.length; spot += 1) {
    for (let flag = 0; flag < QUESTIONS.flag.length; flag += 1) {
      for (let seek = 0; seek < QUESTIONS.seek.length; seek += 1) {
        all.push([spot, flag, seek]);
      }
    }
  }
  return all;
}

describe("chemistry test", () => {
  it("gives each spot and red flag its own element, with a number from the periodic table", () => {
    const keys = new Set<string>();
    const symbols = new Set<string>();
    for (const answers of everyAnswer()) {
      const element = elementFor(answers);
      keys.add(element.key);
      symbols.add(element.symbol);
      expect(element.number).toBeGreaterThanOrEqual(1);
      expect(element.number).toBeLessThanOrEqual(118);
      expect(element.symbol).toMatch(/^[A-Z][a-z]$/);
    }
    expect(keys.size).toBe(QUESTIONS.spot.length * QUESTIONS.flag.length);
    expect(symbols.size).toBe(keys.size);
  });

  it("always gives the same element and match for the same answers", () => {
    for (const answers of everyAnswer()) {
      expect(elementFor(answers)).toEqual(elementFor([...answers] as unknown as Answers));
      expect(matchFor(answers)).toEqual(matchFor([...answers] as unknown as Answers));
    }
  });

  it("matches with someone looking for the same thing, with strong chemistry", () => {
    for (const answers of everyAnswer()) {
      const match = matchFor(answers);
      const seek = QUESTIONS.seek[answers[2]];
      if (seek === "love") {
        expect(PEOPLE[match.person].mode).toBe("love");
      } else if (seek === "friends" || seek === "teammate") {
        expect(PEOPLE[match.person].mode).toBe("friends");
      }
      expect(match.mode).toBe(PEOPLE[match.person].mode);
      expect(match.score).toBeGreaterThanOrEqual(82);
      expect(match.score).toBeLessThanOrEqual(97);
    }
    // Every fictional student can come up.
    expect(new Set(everyAnswer().map((answers) => matchFor(answers).person)).size).toBe(
      Object.keys(PEOPLE).length,
    );
  });

  it("only takes one valid answer per question", () => {
    expect(isComplete([0, 3, 2])).toBe(true);
    expect(isComplete([0, 3])).toBe(false);
    expect(isComplete([0, 4, 1])).toBe(false);
    expect(isComplete([0, 1.5, 1])).toBe(false);
  });
});
