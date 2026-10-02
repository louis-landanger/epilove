import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { checkDateProposal, checkDateResponse, dateIcs, escapeIcsText } from "./date-proposal";
import { CAMPUS_ICEBREAKERS, pickIcebreakers } from "./icebreakers";
import { isSilent, needsNudge } from "./nudge";
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

describe("gentle nudges (CHAT-09)", () => {
  const last = new Date("2026-10-01T18:00:00Z");
  const days = (n: number) => new Date(last.getTime() + n * 86_400_000);

  it("nudges once per silence of three days", () => {
    expect(needsNudge(last, null, days(2.9))).toBe(false);
    expect(needsNudge(last, null, days(3))).toBe(true);
    expect(needsNudge(last, days(3), days(5))).toBe(false);
    // A new message, then a new silence: one more nudge.
    expect(needsNudge(days(6), days(3), days(9))).toBe(true);
    expect(isSilent(last, days(1))).toBe(false);
  });
});

describe("date proposals (CHAT-10)", () => {
  const now = new Date("2026-10-02T12:00:00Z");
  const later = (minutes: number) => new Date(now.getTime() + minutes * 60_000);

  it("needs a place and a time between one hour and sixty days ahead", () => {
    expect(checkDateProposal({ startsAt: later(120), spotId: "s", place: null }, now)).toEqual({ ok: true });
    expect(checkDateProposal({ startsAt: later(120), spotId: null, place: "  " }, now)).toEqual({
      ok: false,
      reason: "no_place",
    });
    expect(checkDateProposal({ startsAt: later(30), spotId: "s", place: null }, now)).toEqual({
      ok: false,
      reason: "too_soon",
    });
    expect(checkDateProposal({ startsAt: later(61 * 24 * 60), spotId: "s", place: null }, now)).toEqual({
      ok: false,
      reason: "too_far",
    });
  });

  it("lets only the other member answer, once, before the date", () => {
    const proposal = { proposerId: "a", status: "proposed" as const, startsAt: later(120) };
    expect(checkDateResponse(proposal, "b", now)).toEqual({ ok: true });
    expect(checkDateResponse(proposal, "a", now)).toEqual({ ok: false, reason: "own_proposal" });
    expect(checkDateResponse({ ...proposal, status: "accepted" }, "b", now)).toEqual({
      ok: false,
      reason: "already_answered",
    });
    expect(checkDateResponse({ ...proposal, startsAt: later(-5) }, "b", now)).toEqual({
      ok: false,
      reason: "past",
    });
  });

  it("writes a valid calendar file, escaped and folded", () => {
    const ics = dateIcs({
      uid: "0192",
      startsAt: new Date("2026-10-10T16:30:00Z"),
      title: "Date, Epilove",
      location: "Place Bellecour; Lyon",
      description: "Rendez-vous près de la statue\nÀ tout à l'heure",
      now,
    });
    expect(ics).toContain("DTSTART:20261010T163000Z\r\n");
    expect(ics).toContain("DTEND:20261010T180000Z\r\n");
    expect(ics).toContain("SUMMARY:Date\\, Epilove\r\n");
    expect(ics).toContain(`${String.raw`LOCATION:Place Bellecour\; Lyon`}\r\n`);
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    for (const line of ics.split("\r\n")) {
      expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    }
    fc.assert(
      fc.property(fc.string(), (text) => {
        expect(escapeIcsText(text)).not.toMatch(/(^|[^\\])[;,]/);
        expect(escapeIcsText(text)).not.toContain("\n");
      }),
    );
  });
});
