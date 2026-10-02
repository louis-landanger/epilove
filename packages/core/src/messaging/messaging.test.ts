import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { CAMPUS_ICEBREAKERS, pickIcebreakers } from "./icebreakers";
import {
  checkMessageChange,
  cleanMessage,
  isPotentiallyOffensive,
  needsSendWarning,
  screenMessage,
} from "./rules";

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

describe("message changes (CHAT-08) and warnings (SAF-09, SAF-10)", () => {
  const sentAt = new Date("2026-10-02T12:00:00Z");
  const at = (minutes: number) => new Date(sentAt.getTime() + minutes * 60_000);
  const message = { senderId: "me", createdAt: sentAt, deleted: false, kind: "text" };

  it("lets the sender edit or delete within ten minutes only", () => {
    expect(checkMessageChange(message, "me", at(9), "edit")).toEqual({ ok: true });
    expect(checkMessageChange(message, "me", at(9), "delete")).toEqual({ ok: true });
    expect(checkMessageChange(message, "me", at(11), "delete")).toEqual({ ok: false, reason: "too_late" });
    expect(checkMessageChange(message, "other", at(1), "edit")).toEqual({ ok: false, reason: "not_sender" });
    expect(checkMessageChange({ ...message, deleted: true }, "me", at(1), "edit")).toEqual({
      ok: false,
      reason: "deleted",
    });
    expect(checkMessageChange({ ...message, kind: "sticker" }, "me", at(1), "edit")).toEqual({
      ok: false,
      reason: "not_editable",
    });
    expect(checkMessageChange({ ...message, kind: "sticker" }, "me", at(1), "delete")).toEqual({ ok: true });
  });

  it("warns before sending an insult and offers a report on offensive messages", () => {
    expect(needsSendWarning(screenMessage("t'es vraiment un connard"))).toBe(true);
    expect(needsSendWarning(screenMessage("on se voit samedi ?"))).toBe(false);
    expect(isPotentiallyOffensive(["shouting"])).toBe(true);
    expect(isPotentiallyOffensive(["link"])).toBe(false);
  });
});
