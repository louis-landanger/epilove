import { canMessage, canSee, canViewProfile } from "@epilove/core";
import { keyRingFromEnv } from "@epilove/crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDatabase } from "../client";
import { devMemberId } from "../dev-seed/members";
import { runDevSeed } from "../dev-seed/seed";
import { runMigrations } from "../migrations";
import { campusDate, loadDiscoverableMembers, loadMember, loadMembers, loadRelations } from "./members";

const url = process.env.DATABASE_URL;
const TEST_KEYS = {
  ENCRYPTION_KEYS: `test:${Buffer.alloc(32, 7).toString("base64")}`,
  ENCRYPTION_CURRENT_KEY_ID: "test",
};

/** Seeds the development data set (without pictures) and reads it back through the repository. */
describe.skipIf(!url)("members repository", () => {
  const { db, close } = createDatabase(url ?? "", { maxConnections: 4 });
  const ines = devMemberId(1);
  const hugo = devMemberId(2);
  const today = campusDate(new Date());

  beforeAll(async () => {
    await runMigrations(db);
    await runDevSeed({
      db,
      keyRing: keyRingFromEnv(process.env.ENCRYPTION_KEYS ? process.env : TEST_KEYS),
      emailHmacSecret: process.env.EMAIL_HMAC_SECRET ?? "test-only-email-hmac-secret-32-chars-min",
      storage: null,
    });
  }, 120_000);
  afterAll(close);

  it("builds members with their preferences and approved photos", async () => {
    const row = await loadMember(db, ines);
    expect(row?.firstName).toBe("Inès");
    expect(row?.member).toMatchObject({ schoolSlug: "supbiotech", gender: "woman", profileComplete: true });
    expect(row?.member.interestedIn).toEqual(["man"]);
    expect(row?.approvedPhotos).toBeGreaterThan(0);
  });

  it("loads the relations of the scripted personas", async () => {
    const rel = await loadRelations(db, ines, [hugo]);
    expect(rel.hasActiveMatch(ines, hugo)).toBe(true);
    expect(rel.hasLiked(ines, hugo)).toBe(true);
    const members = await loadMembers(db, [ines, hugo]);
    const a = members.get(ines)?.member;
    const b = members.get(hugo)?.member;
    if (!a || !b) {
      throw new Error("Personas missing");
    }
    expect(canMessage(a, b, { today, relations: rel })).toEqual({ allowed: true });
    expect(canViewProfile(a, b, { today, relations: rel }).visible).toBe(true);
  });

  it("returns discoverable members and lets canSee filter them", async () => {
    const viewer = await loadMember(db, ines);
    const candidates = await loadDiscoverableMembers(db, ines);
    expect(candidates.length).toBeGreaterThan(200);
    expect(candidates.some((c) => c.member.id === ines)).toBe(false);
    const rel = await loadRelations(
      db,
      ines,
      candidates.map((c) => c.member.id),
    );
    const visible = candidates.filter(
      (c) => viewer && canSee(viewer.member, c.member, { today, relations: rel }).visible,
    );
    expect(visible.length).toBeGreaterThan(10);
    // Inès only looks for men in love mode; women can only appear in friends mode.
    for (const c of visible) {
      const decision = viewer && canSee(viewer.member, c.member, { today, relations: rel });
      if (c.member.gender !== "man" && decision?.visible) {
        expect(decision.modes).toEqual(["friends"]);
      }
    }
  });
});
