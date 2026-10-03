import { dropDayAt, LYON_CAMPUS } from "@epilove/core";
import { createDatabase, schema } from "@epilove/db";
import { cleanupTestMembers, createTestMember, prepareTestDatabase } from "@epilove/db/testing";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestApi } from "../rencontre/testing";

const url = process.env.DATABASE_URL;

describe.skipIf(!url)("discovery.drop", () => {
  const { db, close } = createDatabase(url ?? "", { maxConnections: 4 });
  const { as } = createTestApi(db);
  const day = dropDayAt(new Date(), LYON_CAMPUS.timeZone);
  let createdRun = false;

  beforeAll(async () => {
    await prepareTestDatabase(db);
    // The current Drop day, published (kept as it is if the scheduler already ran it).
    const inserted = await db
      .insert(schema.dropRun)
      .values({ day, computedAt: new Date(), publishedAt: new Date() })
      .onConflictDoUpdate({
        target: schema.dropRun.day,
        set: {
          computedAt: sql`coalesce(${schema.dropRun.computedAt}, now())`,
          publishedAt: sql`coalesce(${schema.dropRun.publishedAt}, now())`,
        },
      })
      .returning({ stats: schema.dropRun.stats });
    createdRun = inserted[0]?.stats === null;
  });
  afterAll(async () => {
    if (createdRun) {
      await db.delete(schema.dropRun).where(eq(schema.dropRun.day, day));
    }
    await cleanupTestMembers(db);
    await close();
  });

  it("shows the Drop's undecided, still visible profiles, and keeps them out of the deck", async () => {
    const viewer = await createTestMember(db, {
      gender: "woman",
      interestedIn: ["man"],
      graduationYear: 2039,
    });
    const man = (firstName: string) =>
      createTestMember(db, { firstName, gender: "man", interestedIn: ["woman"], graduationYear: 2039 });
    const [kept, liked, blocker] = [await man("Kenji"), await man("Lino"), await man("Mehdi")];
    await db.insert(schema.drop).values({ userId: viewer, day, candidates: [kept, liked, blocker] });
    await as(viewer).discovery.decide({ targetId: liked, kind: "like", content: null, comment: null });
    await db.insert(schema.block).values({ blockerId: blocker, blockedId: viewer });

    const drop = await as(viewer).discovery.drop({ locale: "fr" });
    expect(drop.cards.map((c) => c.firstName)).toEqual(["Kenji"]);
    expect(drop.total).toBe(3);
    expect(Date.parse(drop.nextAt)).toBeGreaterThan(Date.now());
    expect(drop.expiresAt).toBe(drop.nextAt);

    const deck = await as(viewer).discovery.deck({ locale: "fr", limit: 20, exclude: [] });
    expect(deck.cards.map((c) => c.userId)).not.toContain(kept);
  });

  it("is empty without a Drop, with the time of the next one", async () => {
    const member = await createTestMember(db);
    const drop = await as(member).discovery.drop({ locale: "fr" });
    expect(drop).toMatchObject({ cards: [], total: 0, expiresAt: null });
  });
});
