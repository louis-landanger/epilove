import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDatabase } from "../client";
import { appUser, notification, pactSeason } from "../schema";
import { cleanupTestMembers, createTestMember, prepareTestDatabase } from "../testing/fixtures";
import { enrolMembers, resultsOfSeason, revealSeason, saveResults, upsertSeason } from "./pact";

const url = process.env.DATABASE_URL;
const SLUG = "test-reveal-deletion";

describe.skipIf(!url)("Pact reveal", () => {
  const { db, close } = createDatabase(url ?? "", { maxConnections: 4 });
  const other = createDatabase(url ?? "", { maxConnections: 1 });
  beforeAll(() => prepareTestDatabase(db));
  afterAll(async () => {
    await db.delete(pactSeason).where(eq(pactSeason.slug, SLUG));
    await cleanupTestMembers(db);
    await other.close();
    await close();
  });

  it("still reveals when a participant's account is deleted while it runs", async () => {
    const now = Date.now();
    const day = 86_400_000;
    const [a, b, gone] = [
      await createTestMember(db, { graduationYear: 2041, modes: ["friends"] }),
      await createTestMember(db, { graduationYear: 2041, modes: ["friends"] }),
      await createTestMember(db, { graduationYear: 2041, modes: ["friends"] }),
    ];
    // A season long past, so that no other test takes it for the current one.
    const seasonId = await upsertSeason(db, {
      slug: SLUG,
      name: "Test",
      opensAt: new Date(now - 400 * day),
      closesAt: new Date(now - 1000),
      revealAt: new Date(now + day),
      status: "closed",
    });
    await enrolMembers(
      db,
      seasonId,
      [a, b, gone].map((userId) => ({ userId, modes: ["friends"] as const })),
      new Date(now),
    );
    const [low, high] = a < b ? [a, b] : [b, a];
    await saveResults(db, {
      seasonId,
      now: new Date(now),
      results: [{ mode: "friends", userLow: low, userHigh: high, score: 0.8, explanation: null }],
      report: {},
    });
    await db
      .update(pactSeason)
      .set({
        opensAt: new Date(now - 400 * day),
        closesAt: new Date(now - 301 * day),
        revealAt: new Date(now - 300 * day),
      })
      .where(eq(pactSeason.id, seasonId));
    const keep = new Set((await resultsOfSeason(db, seasonId)).map((r) => r.id));

    // The unmatched participant's deletion is in flight when the reveal starts.
    let release: () => void = () => {};
    const released = new Promise<void>((resolve) => {
      release = resolve;
    });
    const deletion = other.db.transaction(async (tx) => {
      await tx.delete(appUser).where(eq(appUser.id, gone));
      await released;
    });
    await new Promise((resolve) => setTimeout(resolve, 100));
    const reveal = revealSeason(db, { seasonId, now: new Date(), keep });
    await new Promise((resolve) => setTimeout(resolve, 300));
    release();
    await deletion;

    expect(await reveal).toMatchObject({ revealed: true, matches: 1 });
    const notified = await db
      .select({ userId: notification.userId })
      .from(notification)
      .where(inArray(notification.userId, [a, b, gone]));
    expect(new Set(notified.map((n) => n.userId))).toEqual(new Set([a, b]));
  });
});
