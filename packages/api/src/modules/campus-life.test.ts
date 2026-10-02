import { createDatabase } from "@epilove/db";
import { cleanupTestMembers, createTestMember, prepareTestDatabase } from "@epilove/db/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestApi } from "../rencontre/testing";

const url = process.env.DATABASE_URL;

describe.skipIf(!url)("campus life", () => {
  const { db, close } = createDatabase(url ?? "", { maxConnections: 2 });
  const { as } = createTestApi(db);
  beforeAll(() => prepareTestDatabase(db));
  afterAll(async () => {
    await cleanupTestMembers(db);
    await close();
  });

  it("lists the public Spots around the campus, translated", async () => {
    const member = await createTestMember(db);
    const fr = await as(member).campusLife.spots({ locale: "fr" });
    expect(fr.spots.length).toBeGreaterThanOrEqual(10);
    expect(fr.spots[0]).toMatchObject({ slug: "place-valmy", kind: "square", area: "vaise" });
    for (const spot of fr.spots) {
      // Around Lyon, never elsewhere.
      expect(spot.latitude).toBeGreaterThan(45.7);
      expect(spot.latitude).toBeLessThan(45.82);
      expect(spot.longitude).toBeGreaterThan(4.77);
      expect(spot.longitude).toBeLessThan(4.88);
      expect(["park", "square", "riverbank", "viewpoint"]).toContain(spot.kind);
    }
    const en = await as(member).campusLife.spots({ locale: "en" });
    expect(en.spots.find((s) => s.slug === "berges-du-rhone")?.name).toBe("Rhône riverbanks");
  });

  it("is for signed-in members only", async () => {
    await expect(as(null).campusLife.spots({ locale: "fr" })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});
