import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { canSee, type DeckContext, isDeckCandidate } from "./can-see";
import type { AccountStatus, Gender, Member, Mode, PolicyContext, Relations } from "./types";

const TODAY = "2026-10-02";

function member(overrides: Partial<Member> & Pick<Member, "id">): Member {
  return {
    status: "active",
    profileComplete: true,
    schoolSlug: "epita",
    graduationYear: 2029,
    birthDate: "2005-05-12",
    gender: "woman",
    modes: ["love", "friends"],
    interestedIn: ["man", "woman", "nonbinary"],
    ageRange: { min: 18, max: 30 },
    hideFromOwnSchool: false,
    hideFromOwnYear: false,
    incognito: false,
    emailHmac: `hmac-${overrides.id}`,
    hiddenEmailHmacs: new Set(),
    lastActiveOn: TODAY,
    ...overrides,
  };
}

function relations(blocks: Array<[string, string]> = [], likes: Array<[string, string]> = []): Relations {
  const key = (a: string, b: string) => `${a}>${b}`;
  const blockSet = new Set(blocks.map(([a, b]) => key(a, b)));
  const likeSet = new Set(likes.map(([a, b]) => key(a, b)));
  return {
    hasBlocked: (a, b) => blockSet.has(key(a, b)),
    hasLiked: (a, b) => likeSet.has(key(a, b)),
    hasActiveMatch: () => false,
  };
}

function context(rel: Relations = relations()): PolicyContext {
  return { today: TODAY, relations: rel };
}

describe("canSee — examples", () => {
  const alice = member({ id: "alice", gender: "woman", interestedIn: ["man"] });
  const bob = member({ id: "bob", gender: "man", interestedIn: ["woman"], schoolSlug: "isg" });

  it("shows compatible members with their shared modes", () => {
    expect(canSee(alice, bob, context())).toEqual({ visible: true, modes: ["love", "friends"] });
  });

  it("keeps only friends mode when love preferences do not match", () => {
    const carol = member({ id: "carol", gender: "woman", interestedIn: ["woman"] });
    expect(canSee(alice, carol, context())).toEqual({ visible: true, modes: ["friends"] });
  });

  it("never shows a member to themselves", () => {
    expect(canSee(alice, alice, context())).toEqual({ visible: false, reason: "self" });
  });

  it("hides minors, whoever is looking", () => {
    const minor = member({ id: "minor", birthDate: "2008-10-03" });
    expect(canSee(alice, minor, context())).toEqual({ visible: false, reason: "underage" });
    expect(canSee(minor, alice, context())).toEqual({ visible: false, reason: "underage" });
  });

  it("applies a block in both directions", () => {
    const rel = relations([["bob", "alice"]]);
    expect(canSee(alice, bob, context(rel))).toEqual({ visible: false, reason: "blocked" });
    expect(canSee(bob, alice, context(rel))).toEqual({ visible: false, reason: "blocked" });
  });

  it("applies a hidden contact in both directions", () => {
    const hiding = member({ ...alice, hiddenEmailHmacs: new Set([bob.emailHmac]) });
    expect(canSee(hiding, bob, context())).toEqual({ visible: false, reason: "hidden_contact" });
    expect(canSee(bob, hiding, context())).toEqual({ visible: false, reason: "hidden_contact" });
  });

  it("hides members of the same school or year when either asks for it", () => {
    const sameSchool = member({ id: "dan", gender: "man", interestedIn: ["woman"], graduationYear: 2027 });
    const shy = member({ ...alice, hideFromOwnSchool: true });
    expect(canSee(shy, sameSchool, context())).toEqual({ visible: false, reason: "hidden_school" });
    expect(canSee(sameSchool, shy, context())).toEqual({ visible: false, reason: "hidden_school" });

    const classmate = member({ id: "eve", gender: "man", interestedIn: ["woman"] });
    const yearShy = member({ ...alice, hideFromOwnYear: true });
    expect(canSee(classmate, yearShy, context())).toEqual({ visible: false, reason: "hidden_year" });
    expect(canSee(sameSchool, yearShy, context()).visible).toBe(true);
  });

  it("only shows incognito members to the people they liked", () => {
    const incognito = member({ ...bob, incognito: true });
    expect(canSee(alice, incognito, context())).toEqual({ visible: false, reason: "incognito" });
    expect(canSee(alice, incognito, context(relations([], [["bob", "alice"]]))).visible).toBe(true);
    expect(canSee(incognito, alice, context()).visible).toBe(true);
  });

  it("hides members inactive for more than 21 days", () => {
    expect(canSee(alice, member({ ...bob, lastActiveOn: "2026-09-11" }), context()).visible).toBe(true);
    expect(canSee(alice, member({ ...bob, lastActiveOn: "2026-09-10" }), context())).toEqual({
      visible: false,
      reason: "inactive",
    });
  });

  it("respects age preferences in both directions", () => {
    const older = member({ ...bob, birthDate: "1999-01-01" });
    expect(canSee(member({ ...alice, ageRange: { min: 18, max: 25 } }), older, context())).toEqual({
      visible: false,
      reason: "age_preference",
    });
    expect(canSee(older, member({ ...alice, ageRange: { min: 18, max: 25 } }), context())).toEqual({
      visible: false,
      reason: "age_preference",
    });
  });

  it.each<AccountStatus>(["onboarding", "paused", "suspended", "banned", "deleting"])(
    "hides %s accounts and does not let them browse",
    (status) => {
      expect(canSee(alice, member({ ...bob, status }), context())).toEqual({
        visible: false,
        reason: "target_unavailable",
      });
      expect(canSee(member({ ...bob, status }), alice, context())).toEqual({
        visible: false,
        reason: "viewer_not_eligible",
      });
    },
  );
});

describe("isDeckCandidate", () => {
  const alice = member({ id: "alice" });
  const bob = member({ id: "bob", schoolSlug: "esme" });
  const deck = (overrides: Partial<DeckContext> = {}): DeckContext => ({
    ...context(),
    hasRecentlySwiped: () => false,
    violatesDealbreaker: () => false,
    ...overrides,
  });

  it("excludes recently swiped profiles and dealbreakers", () => {
    expect(isDeckCandidate(alice, bob, deck())).toBe(true);
    expect(isDeckCandidate(alice, bob, deck({ hasRecentlySwiped: () => true }))).toBe(false);
    expect(isDeckCandidate(alice, bob, deck({ violatesDealbreaker: () => true }))).toBe(false);
  });
});

describe("canSee — invariants", () => {
  fc.configureGlobal({ numRuns: 1_000 });

  const genders: Gender[] = ["woman", "man", "nonbinary"];
  const modes: Mode[] = ["love", "friends"];
  const statuses: AccountStatus[] = [
    "onboarding",
    "active",
    "paused",
    "restricted",
    "suspended",
    "banned",
    "deleting",
  ];
  const isoDate = (min: string, max: string) =>
    fc
      .date({ min: new Date(`${min}T00:00:00Z`), max: new Date(`${max}T00:00:00Z`), noInvalidDate: true })
      .map((date) => date.toISOString().slice(0, 10));

  // Biased towards eligible members so that the "visible" branches are well exercised.
  const mostly = <T>(value: T, others: fc.Arbitrary<T>) =>
    fc.oneof({ weight: 5, arbitrary: fc.constant(value) }, { weight: 1, arbitrary: others });

  const memberArb = fc.record({
    status: mostly<AccountStatus>("active", fc.constantFrom(...statuses)),
    profileComplete: mostly(true, fc.boolean()),
    schoolSlug: fc.constantFrom("epita", "esme", "supbiotech", "isg", "ipsa"),
    graduationYear: fc.integer({ min: 2027, max: 2031 }),
    birthDate: isoDate("1996-01-01", "2009-06-30"),
    gender: fc.constantFrom(...genders),
    modes: fc.subarray(modes, { minLength: 1 }),
    interestedIn: fc.subarray(genders),
    ageRange: mostly(
      { min: 18, max: 40 },
      fc
        .record({ min: fc.integer({ min: 18, max: 25 }), span: fc.integer({ min: 0, max: 15 }) })
        .map(({ min, span }) => ({ min, max: min + span })),
    ),
    hideFromOwnSchool: mostly(false, fc.boolean()),
    hideFromOwnYear: mostly(false, fc.boolean()),
    incognito: mostly(false, fc.boolean()),
    lastActiveOn: mostly(TODAY, isoDate("2026-08-15", TODAY)),
  });

  const pairArb = fc
    .record({
      a: memberArb,
      b: memberArb,
      aHidesB: mostly(false, fc.boolean()),
      bHidesA: mostly(false, fc.boolean()),
      blocks: mostly<Array<[string, string]>>(
        [],
        fc.subarray<[string, string]>([
          ["A", "B"],
          ["B", "A"],
        ]),
      ),
      likes: fc.subarray<[string, string]>([
        ["A", "B"],
        ["B", "A"],
      ]),
    })
    .map(({ a, b, aHidesB, bHidesA, blocks, likes }) => ({
      a: member({ ...a, id: "A", hiddenEmailHmacs: new Set(aHidesB ? ["hmac-B"] : []) }),
      b: member({ ...b, id: "B", hiddenEmailHmacs: new Set(bHidesA ? ["hmac-A"] : []) }),
      ctx: context(relations(blocks, likes)),
    }));

  it("generates enough visible pairs for the invariants to be meaningful", () => {
    const visible = fc.sample(pairArb, 2_000).filter(({ a, b, ctx }) => canSee(a, b, ctx).visible);
    expect(visible.length).toBeGreaterThan(100);
  });

  it("never shows anyone to themselves", () => {
    fc.assert(
      fc.property(
        memberArb,
        (m) => !canSee(member({ ...m, id: "A" }), member({ ...m, id: "A" }), context()).visible,
      ),
    );
  });

  it("is symmetric when neither member is incognito or inactive", () => {
    fc.assert(
      fc.property(pairArb, ({ a, b, ctx }) => {
        const a2 = member({ ...a, incognito: false, lastActiveOn: TODAY });
        const b2 = member({ ...b, incognito: false, lastActiveOn: TODAY });
        expect(canSee(a2, b2, ctx).visible).toBe(canSee(b2, a2, ctx).visible);
      }),
    );
  });

  it("never lets a block, a hidden contact or an unavailable account through", () => {
    fc.assert(
      fc.property(pairArb, ({ a, b, ctx }) => {
        const decision = canSee(a, b, ctx);
        if (!decision.visible) {
          return;
        }
        expect(ctx.relations.hasBlocked("A", "B") || ctx.relations.hasBlocked("B", "A")).toBe(false);
        expect(a.hiddenEmailHmacs.has(b.emailHmac) || b.hiddenEmailHmacs.has(a.emailHmac)).toBe(false);
        expect(["active", "restricted"]).toContain(a.status);
        expect(["active", "restricted"]).toContain(b.status);
        expect(a.profileComplete && b.profileComplete).toBe(true);
      }),
    );
  });

  it("only returns modes both members chose, and love only when attraction is mutual", () => {
    fc.assert(
      fc.property(pairArb, ({ a, b, ctx }) => {
        const decision = canSee(a, b, ctx);
        if (!decision.visible) {
          return;
        }
        expect(decision.modes.length).toBeGreaterThan(0);
        for (const mode of decision.modes) {
          expect(a.modes).toContain(mode);
          expect(b.modes).toContain(mode);
        }
        if (decision.modes.includes("love")) {
          expect(a.interestedIn).toContain(b.gender);
          expect(b.interestedIn).toContain(a.gender);
        }
      }),
    );
  });
});
