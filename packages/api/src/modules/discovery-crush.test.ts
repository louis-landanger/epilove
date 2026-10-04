import { randomUUID } from "node:crypto";
import { emailHmac } from "@atomes/crypto";
import { createDatabase, schema } from "@atomes/db";
import { saveDeckFilter } from "@atomes/db/repositories/discovery";
import { cleanupTestMembers, createTestMember, prepareTestDatabase } from "@atomes/db/testing";
import { and, eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestApi, TEST_EMAIL_HMAC_SECRET } from "../rencontre/testing";

const url = process.env.DATABASE_URL;

describe.skipIf(!url)("secret crush and second chance", () => {
  const { db, close } = createDatabase(url ?? "", { maxConnections: 4 });
  const { as } = createTestApi(db);
  beforeAll(() => prepareTestDatabase(db));
  afterAll(async () => {
    await cleanupTestMembers(db);
    await close();
  });

  const emailOf = (id: string) => `test-${id}@epita.fr`;

  /** A member whose stored fingerprint matches their address under the test secret. */
  async function member(options: Parameters<typeof createTestMember>[1] = {}) {
    const id = await createTestMember(db, { graduationYear: 2039, ...options });
    await db
      .update(schema.appUser)
      .set({ emailHmac: emailHmac(TEST_EMAIL_HMAC_SECRET, emailOf(id)) })
      .where(eq(schema.appUser.id, id));
    return id;
  }

  const matchesBetween = (a: string, b: string) =>
    db
      .select({ source: schema.match.source, mode: schema.match.mode })
      .from(schema.match)
      .where(and(inArray(schema.match.userLow, [a, b]), inArray(schema.match.userHigh, [a, b])));

  it("keeps a one-sided crush secret", async () => {
    const a = await member({ firstName: "Anouk" });
    const b = await member({ firstName: "Bruno" });
    const result = await as(a).discovery.addCrush({ email: emailOf(b).toUpperCase(), locale: "fr" });
    expect(result.matched).toBeNull();
    expect(result.crushes).toEqual([expect.objectContaining({ hint: "t•••@epita.fr", status: "active" })]);
    expect((await as(b).discovery.crushes()).crushes).toEqual([]);
    expect(await matchesBetween(a, b)).toEqual([]);
    const notifications = await db
      .select({ type: schema.notification.type })
      .from(schema.notification)
      .where(eq(schema.notification.userId, b));
    expect(notifications).toEqual([]);
  });

  it("matches immediately when the crush is mutual", async () => {
    const a = await member({ firstName: "Alma", gender: "woman", interestedIn: ["man"] });
    const b = await member({ firstName: "Basile", gender: "man", interestedIn: ["woman"] });
    await as(a).discovery.addCrush({ email: emailOf(b), locale: "fr" });
    const second = await as(b).discovery.addCrush({ email: emailOf(a), locale: "fr" });
    expect(second.matched?.card.firstName).toBe("Alma");
    expect(await matchesBetween(a, b)).toEqual([{ source: "crush", mode: "love" }]);
    expect((await as(a).discovery.crushes()).crushes[0]?.status).toBe("matched");
    const notified = await db
      .select({ userId: schema.notification.userId })
      .from(schema.notification)
      .where(and(inArray(schema.notification.userId, [a, b]), eq(schema.notification.type, "match_created")));
    expect(notified).toHaveLength(2);
  });

  it("does not match across a block, and says nothing", async () => {
    const a = await member();
    const b = await member();
    await db.insert(schema.block).values({ blockerId: a, blockedId: b });
    await as(a).discovery.addCrush({ email: emailOf(b), locale: "fr" });
    const second = await as(b).discovery.addCrush({ email: emailOf(a), locale: "fr" });
    expect(second.matched).toBeNull();
    expect(await matchesBetween(a, b)).toEqual([]);
  });

  it("limits active crushes and additions, idempotently", async () => {
    const a = await member();
    const stranger = () => `someone-${randomUUID().slice(0, 8)}@isg.fr`;
    const first = stranger();
    await as(a).discovery.addCrush({ email: first, locale: "fr" });
    await as(a).discovery.addCrush({ email: stranger(), locale: "fr" });
    const third = await as(a).discovery.addCrush({ email: stranger(), locale: "fr" });
    expect(third.crushes).toHaveLength(3);
    // The same address again changes nothing.
    expect((await as(a).discovery.addCrush({ email: first, locale: "fr" })).crushes).toHaveLength(3);
    await expect(as(a).discovery.addCrush({ email: stranger(), locale: "fr" })).rejects.toMatchObject({
      message: "crush_limit",
    });
    // Withdrawing frees a slot, but additions are counted over 30 days.
    for (let i = 0; i < 7; i++) {
      const [latest] = (await as(a).discovery.crushes()).crushes;
      await as(a).discovery.removeCrush({ crushId: latest?.id ?? "" });
      await as(a).discovery.addCrush({ email: stranger(), locale: "fr" });
    }
    const [latest] = (await as(a).discovery.crushes()).crushes;
    await as(a).discovery.removeCrush({ crushId: latest?.id ?? "" });
    await expect(as(a).discovery.addCrush({ email: stranger(), locale: "fr" })).rejects.toMatchObject({
      message: "crush_rate",
    });
  });

  it("refuses invalid addresses and one's own", async () => {
    const a = await member();
    for (const email of ["not-an-email", "someone@gmail.com", "x@epita.fr.example.com"]) {
      await expect(as(a).discovery.addCrush({ email, locale: "fr" })).rejects.toMatchObject({
        message: "invalid_email",
      });
    }
    await expect(as(a).discovery.addCrush({ email: emailOf(a), locale: "fr" })).rejects.toMatchObject({
      message: "self",
    });
  });

  it("brings a pass back after 45 days only if the profile changed since", async () => {
    const viewer = await member({ gender: "woman", interestedIn: ["man"] });
    const target = await member({ gender: "man", interestedIn: ["woman"], firstName: "Côme" });
    await saveDeckFilter(db, viewer, {
      mode: "all",
      schoolSlugs: [],
      graduationYears: [2039],
      intentions: [],
      ageMin: null,
      ageMax: null,
    });
    const daysAgo = (days: number) => new Date(Date.now() - days * 86_400_000);
    await db
      .update(schema.photo)
      .set({ updatedAt: daysAgo(60) })
      .where(eq(schema.photo.userId, target));
    await db
      .insert(schema.likeAction)
      .values({ actorId: viewer, targetId: target, kind: "pass", createdAt: daysAgo(50) });

    const before = await as(viewer).discovery.deck({ locale: "fr", limit: 20, exclude: [] });
    expect(before.cards.map((c) => c.userId)).not.toContain(target);

    await db
      .update(schema.photo)
      .set({ updatedAt: daysAgo(5) })
      .where(eq(schema.photo.userId, target));
    const after = await as(viewer).discovery.deck({ locale: "fr", limit: 20, exclude: [] });
    expect(after.cards.map((c) => c.userId)).toContain(target);
    expect(after.secondChance).toContain(target);
  });
});
