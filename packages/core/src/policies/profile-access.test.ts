import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { canSee } from "./can-see";
import { canMessage, canViewProfile } from "./profile-access";
import { TEST_TODAY, testMember, testRelations } from "./testing";
import type { AccountStatus, Gender, Mode, PolicyContext, Relations } from "./types";

const ctx = (relations: Relations = testRelations()): PolicyContext => ({ today: TEST_TODAY, relations });

describe("canViewProfile — examples", () => {
  const alice = testMember({ id: "alice", gender: "woman", interestedIn: ["man"] });
  const bob = testMember({ id: "bob", gender: "man", interestedIn: ["woman"], schoolSlug: "isg" });

  it("lets members see themselves", () => {
    expect(canViewProfile(alice, alice, ctx())).toEqual({ visible: true, via: "self" });
  });

  it("shows discoverable members", () => {
    expect(canViewProfile(alice, bob, ctx())).toEqual({ visible: true, via: "discovery" });
  });

  it("keeps a match visible after they pause, but not other paused members", () => {
    const paused = testMember({ ...bob, status: "paused" });
    expect(canViewProfile(alice, paused, ctx(testRelations({ matches: [["alice", "bob"]] })))).toEqual({
      visible: true,
      via: "match",
    });
    expect(canViewProfile(alice, paused, ctx())).toEqual({ visible: false, reason: "target_unavailable" });
  });

  it("shows someone who liked you even when the deck would not", () => {
    const picky = testMember({ ...alice, ageRange: { min: 18, max: 22 } });
    const outOfRange = testMember({ ...bob, birthDate: "1998-01-01" });
    expect(canViewProfile(picky, outOfRange, ctx())).toEqual({ visible: false, reason: "age_preference" });
    expect(canViewProfile(picky, outOfRange, ctx(testRelations({ likes: [["bob", "alice"]] })))).toEqual({
      visible: true,
      via: "liked_you",
    });
  });

  it("still applies school hiding to likes received", () => {
    const classmate = testMember({ id: "carl", gender: "man", interestedIn: ["woman"] });
    const shy = testMember({ ...alice, hideFromOwnSchool: true });
    expect(canViewProfile(shy, classmate, ctx(testRelations({ likes: [["carl", "alice"]] })))).toEqual({
      visible: false,
      reason: "hidden_school",
    });
  });

  it("closes everything after a block, even with a match", () => {
    const rel = testRelations({ blocks: [["bob", "alice"]], matches: [["alice", "bob"]] });
    expect(canViewProfile(alice, bob, ctx(rel))).toEqual({ visible: false, reason: "blocked" });
    expect(canMessage(alice, bob, ctx(rel))).toEqual({ allowed: false, reason: "blocked" });
  });

  it("hides banned, suspended, deleting and onboarding members", () => {
    for (const status of ["banned", "suspended", "deleting", "onboarding"] as const) {
      const target = testMember({ ...bob, status });
      expect(canViewProfile(alice, target, ctx(testRelations({ matches: [["alice", "bob"]] })))).toEqual({
        visible: false,
        reason: "target_unavailable",
      });
    }
  });
});

describe("canMessage — examples", () => {
  const alice = testMember({ id: "alice" });
  const bob = testMember({ id: "bob" });
  const matched = testRelations({ matches: [["alice", "bob"]] });

  it("allows matched members, including while paused or restricted", () => {
    expect(canMessage(alice, bob, ctx(matched))).toEqual({ allowed: true });
    expect(canMessage(testMember({ ...alice, status: "paused" }), bob, ctx(matched))).toEqual({
      allowed: true,
    });
    expect(canMessage(testMember({ ...alice, status: "restricted" }), bob, ctx(matched))).toEqual({
      allowed: true,
    });
  });

  it("refuses without an active match", () => {
    expect(canMessage(alice, bob, ctx())).toEqual({ allowed: false, reason: "no_match" });
  });

  it("refuses when either hides the other's address", () => {
    const hiding = testMember({ ...alice, hiddenEmailHmacs: new Set([bob.emailHmac]) });
    expect(canMessage(bob, hiding, ctx(matched))).toEqual({ allowed: false, reason: "hidden_contact" });
  });
});

describe("profile access — invariants", () => {
  fc.configureGlobal({ numRuns: 2_000 });
  const genders: Gender[] = ["woman", "man", "nonbinary"];
  const statuses: AccountStatus[] = [
    "onboarding",
    "active",
    "paused",
    "restricted",
    "suspended",
    "banned",
    "deleting",
  ];
  const mostly = <T>(value: T, others: fc.Arbitrary<T>) =>
    fc.oneof({ weight: 4, arbitrary: fc.constant(value) }, { weight: 1, arbitrary: others });

  const memberArb = (id: string) =>
    fc
      .record({
        status: mostly<AccountStatus>("active", fc.constantFrom(...statuses)),
        schoolSlug: fc.constantFrom("epita", "isg"),
        graduationYear: fc.constantFrom(2028, 2029),
        gender: fc.constantFrom(...genders),
        modes: fc.subarray<Mode>(["love", "friends"], { minLength: 1 }),
        interestedIn: fc.subarray(genders),
        hideFromOwnSchool: mostly(false, fc.boolean()),
        hideFromOwnYear: mostly(false, fc.boolean()),
        hides: mostly(false, fc.boolean()),
        birthDate: mostly("2004-01-01", fc.constantFrom("2009-01-01", "1999-01-01")),
      })
      .map(({ hides, ...rest }) =>
        testMember({
          ...rest,
          id,
          hiddenEmailHmacs: new Set(hides ? [id === "A" ? "hmac-B" : "hmac-A"] : []),
        }),
      );

  const pairs = fc.subarray<readonly [string, string]>([
    ["A", "B"],
    ["B", "A"],
  ]);
  const scenario = fc.record({
    a: memberArb("A"),
    b: memberArb("B"),
    blocks: mostly([], pairs),
    likes: pairs,
    matched: fc.boolean(),
    ended: mostly(false, fc.boolean()),
  });

  it("never opens anything across a block, an unmatch, a hidden contact or an unavailable account", () => {
    fc.assert(
      fc.property(scenario, ({ a, b, blocks, likes, matched, ended }) => {
        const c = ctx(
          testRelations({
            blocks,
            likes,
            matches: matched && !ended ? [["A", "B"]] : [],
            ended: ended ? [["A", "B"]] : [],
          }),
        );
        const blocked = blocks.length > 0 || ended;
        const hidden = a.hiddenEmailHmacs.has(b.emailHmac) || b.hiddenEmailHmacs.has(a.emailHmac);
        const gone = (m: typeof a) => ["banned", "suspended", "deleting", "onboarding"].includes(m.status);
        if (blocked || hidden || gone(a) || gone(b)) {
          expect(canViewProfile(a, b, c).visible).toBe(false);
          expect(canViewProfile(b, a, c).visible).toBe(false);
          expect(canSee(a, b, c).visible).toBe(false);
          expect(canMessage(a, b, c).allowed).toBe(false);
          expect(canMessage(b, a, c).allowed).toBe(false);
        }
      }),
    );
  });

  it("only allows messages inside an active match, symmetrically, and implies profile access", () => {
    fc.assert(
      fc.property(scenario, ({ a, b, blocks, likes, matched }) => {
        const c = ctx(testRelations({ blocks, likes, matches: matched ? [["A", "B"]] : [] }));
        const decision = canMessage(a, b, c);
        if (!matched) {
          expect(decision.allowed).toBe(false);
        }
        expect(decision.allowed).toBe(canMessage(b, a, c).allowed);
        if (decision.allowed) {
          expect(canViewProfile(a, b, c).visible).toBe(true);
          expect(canViewProfile(b, a, c).visible).toBe(true);
        }
      }),
    );
  });

  it("never shows a minor, whatever the relationship", () => {
    fc.assert(
      fc.property(scenario, ({ a, b, likes }) => {
        const minor = testMember({ ...b, birthDate: "2009-01-01" });
        const c = ctx(testRelations({ likes, matches: [["A", "B"]] }));
        expect(canViewProfile(a, minor, c).visible).toBe(false);
        expect(canMessage(a, minor, c).allowed).toBe(false);
      }),
    );
  });
});
