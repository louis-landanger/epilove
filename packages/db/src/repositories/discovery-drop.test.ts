import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDatabase } from "../client";
import { appUser, drop, dropRun, notification } from "../schema";
import { cleanupTestMembers, createTestMember, prepareTestDatabase } from "../testing/fixtures";
import { publishDrops } from "./discovery-drop";

const url = process.env.DATABASE_URL;
/** A past day nobody else computes or publishes. */
const DAY = "2025-11-20";

describe.skipIf(!url)("Drop publication", () => {
  const { db, close } = createDatabase(url ?? "", { maxConnections: 4 });
  const other = createDatabase(url ?? "", { maxConnections: 1 });
  beforeAll(() => prepareTestDatabase(db));
  afterAll(async () => {
    await db.delete(drop).where(eq(drop.day, DAY));
    await db.delete(dropRun).where(eq(dropRun.day, DAY));
    await cleanupTestMembers(db);
    await other.close();
    await close();
  });

  it("still publishes when a recipient's account is deleted while it runs", async () => {
    const kept = await createTestMember(db, { graduationYear: 2041 });
    const gone = await createTestMember(db, { graduationYear: 2041 });
    const candidate = await createTestMember(db, { graduationYear: 2041 });
    await db.insert(dropRun).values({ day: DAY, computedAt: new Date() });
    await db.insert(drop).values([
      { userId: kept, day: DAY, candidates: [candidate] },
      { userId: gone, day: DAY, candidates: [candidate] },
    ]);

    // The account deletion is in flight (row locked, not committed) when the publication starts.
    let release: () => void = () => {};
    const released = new Promise<void>((resolve) => {
      release = resolve;
    });
    const deletion = other.db.transaction(async (tx) => {
      await tx.delete(appUser).where(eq(appUser.id, gone));
      await released;
    });
    await new Promise((resolve) => setTimeout(resolve, 100));
    const publication = publishDrops(db, DAY, new Date());
    await new Promise((resolve) => setTimeout(resolve, 300));
    release();
    await deletion;

    expect(await publication).toBe(1);
    const sent = await db
      .select({ userId: notification.userId })
      .from(notification)
      .where(inArray(notification.userId, [kept, gone]));
    expect(sent).toEqual([{ userId: kept }]);
  });
});
