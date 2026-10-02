import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDatabase } from "../client";
import { impression } from "../schema";
import { cleanupTestMembers, createTestMember, prepareTestDatabase } from "../testing/fixtures";
import { recordImpressions } from "./discovery";

const url = process.env.DATABASE_URL;

describe.skipIf(!url)("recordImpressions", () => {
  const { db, close } = createDatabase(url ?? "", { maxConnections: 2 });
  beforeAll(() => prepareTestDatabase(db));
  afterAll(async () => {
    await cleanupTestMembers(db);
    await close();
  });

  it("skips a member deleted in the meantime instead of failing the page", async () => {
    const viewer = await createTestMember(db);
    const shown = await createTestMember(db);
    const deleted = randomUUID();
    await recordImpressions(db, viewer, [shown, deleted], "deck", "2026-10-02");
    const rows = await db.select().from(impression).where(eq(impression.viewerId, viewer));
    expect(rows.map((r) => r.targetId)).toEqual([shown]);
  });
});
