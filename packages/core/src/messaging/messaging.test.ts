import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { CAMPUS_ICEBREAKERS, pickIcebreakers } from "./icebreakers";
import { cleanMessage, screenMessage } from "./rules";

describe("screenMessage", () => {
  it("flags links, contact handles, insults, shouting and repetitions", () => {
    expect(screenMessage("Salut ! Ta réponse sur Fourvière m'a fait rire")).toEqual([]);
    expect(screenMessage("regarde https://example.com")).toContain("link");
    expect(screenMessage("ajoute moi sur snap")).toContain("contact_handle");
    expect(screenMessage("06 12 34 56 78")).toContain("contact_handle");
    expect(screenMessage("t'es qu'une s4lope")).toContain("insult");
    expect(screenMessage("t'es qu'une $alope")).toContain("insult");
    expect(screenMessage("POURQUOI TU NE REPONDS PAS")).toContain("shouting");
    expect(screenMessage("allooooooooooooo")).toContain("repetition");
  });

  it("does not flag ordinary words containing an insult", () => {
    expect(screenMessage("Je suis à la tapisserie du campus")).toEqual([]);
  });
});

describe("cleanMessage", () => {
  it("trims, removes zero-width characters and collapses blank lines", () => {
    expect(cleanMessage("  salut​\n\n\n\nça va ?  ")).toBe("salut\n\nça va ?");
    expect(cleanMessage("​​")).toBe("");
  });
});

describe("pickIcebreakers", () => {
  it("prefers personal starters and is stable for a pair", () => {
    const input = {
      sharedInterests: ["Escalade"],
      theirPrompts: ["Mon plan parfait pour un dimanche à Lyon…"],
      sharedAnswers: [{ question: "Lève-tôt ou couche-tard ?", answer: "Couche-tard" }],
      seed: "match-1",
    };
    const picks = pickIcebreakers(input);
    expect(picks.map((p) => p.key)).toEqual(["sharedInterest", "theirPrompt", "sharedAnswer"]);
    expect(pickIcebreakers(input)).toEqual(picks);
  });

  it("always returns the requested number of starters", () => {
    fc.assert(
      fc.property(fc.string(), fc.array(fc.string(), { maxLength: 3 }), (seed, interests) => {
        const picks = pickIcebreakers({
          sharedInterests: interests,
          theirPrompts: [],
          sharedAnswers: [],
          seed,
        });
        expect(picks).toHaveLength(3);
        for (const p of picks) {
          if (p.key === "campus") {
            expect(p.params.index).toBeLessThan(CAMPUS_ICEBREAKERS);
          }
        }
      }),
    );
  });
});
