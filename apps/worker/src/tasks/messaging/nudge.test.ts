import { createDatabase, schema } from "@epilove/db";
import { recordNudges } from "@epilove/db/repositories/matches";
import { cleanupTestMembers, createTestMember, prepareTestDatabase } from "@epilove/db/testing";
import { and, eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sendNudges } from "./nudge";

const url = process.env.DATABASE_URL;

describe.skipIf(!url)("gentle nudges", () => {
  const { db, close } = createDatabase(url ?? "", { maxConnections: 4 });
  beforeAll(() => prepareTestDatabase(db));
  afterAll(async () => {
    await cleanupTestMembers(db);
    await close();
  });

  async function silentMatch(daysAgo: number) {
    const a = await createTestMember(db);
    const b = await createTestMember(db);
    const [userLow, userHigh] = a < b ? [a, b] : [b, a];
    const [row] = await db
      .insert(schema.match)
      .values({
        userLow,
        userHigh,
        mode: "friends",
        source: "like",
        createdAt: new Date(Date.now() - daysAgo * 86_400_000),
      })
      .returning({ id: schema.match.id });
    return { a, b, matchId: row?.id ?? "" };
  }

  const nudgesOf = (members: string[]) =>
    db
      .select({ userId: schema.notification.userId })
      .from(schema.notification)
      .where(and(inArray(schema.notification.userId, members), eq(schema.notification.type, "chat_nudge")));

  it("nudges both members of a silent match once, and spares blocked pairs", async () => {
    const silent = await silentMatch(4);
    const recent = await silentMatch(1);
    const blocked = await silentMatch(5);
    await db.insert(schema.block).values({ blockerId: blocked.a, blockedId: blocked.b });

    await sendNudges(db, new Date());
    expect(await nudgesOf([silent.a, silent.b])).toHaveLength(2);
    expect(await nudgesOf([recent.a, recent.b])).toHaveLength(0);
    expect(await nudgesOf([blocked.a, blocked.b])).toHaveLength(0);

    await sendNudges(db, new Date());
    expect(await nudgesOf([silent.a, silent.b])).toHaveLength(2);
  });

  it("still nudges the others when a member is deleted after the matches were picked", async () => {
    const kept = await silentMatch(4);
    const gone = await silentMatch(4);
    const picked = [kept, gone].map((m) => ({ id: m.matchId, members: [m.a, m.b] }));
    // Account deleted between the selection and the insert (the match goes with it).
    await db.delete(schema.appUser).where(eq(schema.appUser.id, gone.a));

    await recordNudges(db, picked, new Date());
    expect(await nudgesOf([kept.a, kept.b])).toHaveLength(2);
    expect(await nudgesOf([gone.b])).toHaveLength(0);
  });
});
