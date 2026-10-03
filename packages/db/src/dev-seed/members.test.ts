import { isAdult } from "@epilove/core";
import { describe, expect, it } from "vitest";
import { QUESTIONS } from "../seeds/questions";
import { planActivity, sharedMode } from "./graph";
import { DEV_MEMBER_COUNT, devMemberId, generateMembers, PERSONAS } from "./members";
import { encodePng } from "./photos";
import { Random } from "./random";

const members = generateMembers(new Random(42));

describe("development members", () => {
  it("is deterministic", () => {
    expect(generateMembers(new Random(42))).toEqual(members);
  });

  it("creates the expected number of adults, personas first", () => {
    expect(members).toHaveLength(DEV_MEMBER_COUNT);
    expect(members.every((m) => isAdult(m.birthDate, "2026-10-02"))).toBe(true);
    expect(members.slice(0, PERSONAS.length).map((m) => m.persona)).toEqual(PERSONAS.map((p) => p.persona));
    expect(members[0]?.id).toBe(devMemberId(1));
    expect(new Set(members.map((m) => m.email)).size).toBe(members.length);
  });

  it("follows the gender mix of each school", () => {
    const share = (slug: string) => {
      const school = members.filter((m) => m.schoolSlug === slug);
      return school.filter((m) => m.gender === "woman").length / school.length;
    };
    expect(share("epita")).toBeLessThan(0.3);
    expect(share("supbiotech")).toBeGreaterThan(0.55);
  });

  it("never stores an orientation without love mode (no sensitive data without consent)", () => {
    for (const m of members) {
      if (!m.modes.includes("love")) {
        expect(m.interestedIn).toEqual([]);
      }
    }
  });

  it("answers with known options only, the own answer always acceptable", () => {
    const options = new Map(QUESTIONS.map((q) => [q.slug, new Set(q.options.map((o) => o.value))]));
    for (const m of members) {
      for (const a of m.answers) {
        expect(options.get(a.questionSlug)?.has(a.answer)).toBe(true);
        expect(a.acceptable).toContain(a.answer);
      }
    }
  });
});

describe("simulated activity", () => {
  const plan = planActivity(new Random(7), members);
  const byId = new Map(members.map((m) => [m.id, m]));

  it("only matches members who share a mode, never across a block", () => {
    const blocked = new Set(plan.blocks.map(([a, b]) => [a, b].sort().join("|")));
    expect(plan.matches.length).toBeGreaterThan(80);
    for (const m of plan.matches) {
      const a = byId.get(m.userA);
      const b = byId.get(m.userB);
      expect(a && b && sharedMode(a, b)).toBe(m.mode);
      expect(blocked.has([m.userA, m.userB].sort().join("|"))).toBe(false);
    }
  });

  it("backs every match with two likes", () => {
    const likes = new Map(plan.likes.map((l) => [`${l.actorId}>${l.targetId}`, l.kind]));
    for (const m of plan.matches) {
      expect(likes.get(`${m.userA}>${m.userB}`)).not.toBe("pass");
      expect(likes.get(`${m.userB}>${m.userA}`)).not.toBe("pass");
      expect(likes.has(`${m.userA}>${m.userB}`) && likes.has(`${m.userB}>${m.userA}`)).toBe(true);
    }
  });
});

describe("synthetic pictures", () => {
  it("encodes a valid PNG", () => {
    const png = encodePng(2, 1, new Uint8Array([255, 0, 0, 0, 0, 255]));
    expect(png.subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    expect(png.subarray(12, 16).toString("ascii")).toBe("IHDR");
    expect(png.readUInt32BE(16)).toBe(2);
  });
});
