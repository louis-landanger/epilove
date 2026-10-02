import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { TEST_TODAY, testMember, testRelations } from "../policies/testing";
import { crushHint, crushMatchMode } from "./crush";
import { canResurface, swipeBlocksCandidate } from "./second-chance";

const context = (relations = testRelations()) => ({ today: TEST_TODAY, relations });

describe("secret crush", () => {
  it("shows only the first letter and the school domain", () => {
    expect(crushHint("alice.martin@epita.fr")).toBe("a•••@epita.fr");
  });

  it("matches in love when both are open to it, friends otherwise", () => {
    const a = testMember({ id: "a", gender: "woman", interestedIn: ["man"] });
    const b = testMember({ id: "b", gender: "man", interestedIn: ["woman"] });
    expect(crushMatchMode(a, b, context())).toBe("love");
    const c = testMember({ id: "c", gender: "woman", interestedIn: ["man"] });
    expect(crushMatchMode(a, c, context())).toBe("friends");
  });

  it("never matches across a block, an unmatch, a hidden contact or an existing match", () => {
    const a = testMember({ id: "a" });
    const b = testMember({ id: "b" });
    expect(crushMatchMode(a, b, context(testRelations({ blocks: [["b", "a"]] })))).toBeNull();
    expect(crushMatchMode(a, b, context(testRelations({ ended: [["a", "b"]] })))).toBeNull();
    expect(crushMatchMode(a, b, context(testRelations({ matches: [["a", "b"]] })))).toBeNull();
    const hiding = testMember({ id: "a", hiddenEmailHmacs: new Set([b.emailHmac]) });
    expect(crushMatchMode(hiding, b, context())).toBeNull();
    const minor = testMember({ id: "b", birthDate: "2010-01-01" });
    expect(crushMatchMode(a, minor, context())).toBeNull();
  });

  it("is not stopped by incognito: a mutual crush is mutual interest", () => {
    const a = testMember({ id: "a", incognito: true });
    expect(crushMatchMode(a, testMember({ id: "b" }), context())).not.toBeNull();
  });
});

describe("second chance", () => {
  const passedAt = new Date("2026-08-01T12:00:00Z");
  const later = (days: number) => new Date(passedAt.getTime() + days * 86_400_000);

  it("brings a pass back after 45 days only if the profile changed since", () => {
    expect(canResurface({ at: passedAt }, later(10), later(44))).toBe(false);
    expect(canResurface({ at: passedAt }, null, later(60))).toBe(false);
    expect(canResurface({ at: passedAt }, later(-3), later(60))).toBe(false);
    expect(canResurface({ at: passedAt }, later(50), later(60))).toBe(true);
  });

  it("never brings a like back", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 400 }), fc.integer({ min: -100, max: 400 }), (days, change) => {
        expect(swipeBlocksCandidate({ kind: "like", at: passedAt }, later(change), later(days))).toBe(true);
        expect(swipeBlocksCandidate({ kind: "superlike", at: passedAt }, later(change), later(days))).toBe(
          true,
        );
      }),
    );
    expect(swipeBlocksCandidate(undefined, null, later(1))).toBe(false);
  });
});
