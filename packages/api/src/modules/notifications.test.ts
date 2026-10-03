import { createDatabase, schema } from "@epilove/db";
import { cleanupTestMembers, createTestMember, prepareTestDatabase } from "@epilove/db/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestApi } from "../rencontre/testing";

const url = process.env.DATABASE_URL;

describe.skipIf(!url)("notifications", () => {
  const { db, close } = createDatabase(url ?? "", { maxConnections: 4 });
  const { as } = createTestApi(db);
  beforeAll(() => prepareTestDatabase(db));
  afterAll(async () => {
    await cleanupTestMembers(db);
    await close();
  });

  it("lists notifications newest first, with a cursor, and marks them read", async () => {
    const member = await createTestMember(db);
    const at = (minutesAgo: number) => new Date(Date.now() - minutesAgo * 60_000);
    // Inserted out of order on purpose.
    await db.insert(schema.notification).values([
      { userId: member, type: "like_received", payload: {}, createdAt: at(30) },
      {
        userId: member,
        type: "match_created",
        payload: { matchId: "01920000-0000-7000-8000-000000000009" },
        createdAt: at(1),
      },
      {
        userId: member,
        type: "message_received",
        payload: { matchId: "01920000-0000-7000-8000-000000000009" },
        createdAt: at(10),
      },
    ]);
    const first = await as(member).notifications.list({ limit: 2 });
    expect(first.items.map((i) => i.type)).toEqual(["match_created", "message_received"]);
    expect(first.items[0]?.url).toBe("/messages/01920000-0000-7000-8000-000000000009");
    expect(first.hasMore).toBe(true);
    expect(first.unread).toBe(3);
    const second = await as(member).notifications.list({ limit: 2, before: first.items[1]?.id });
    expect(second.items.map((i) => i.type)).toEqual(["like_received"]);
    await expect(as(member).notifications.markRead({ ids: "all" })).resolves.toEqual({ unread: 0 });
  });

  it("stores preferences per group with push on and email off by default", async () => {
    const member = await createTestMember(db);
    const defaults = await as(member).notifications.preferences();
    expect(defaults.groups.messages).toEqual({ push: true, email: false });
    const saved = await as(member).notifications.savePreferences({
      groups: { ...defaults.groups, likes: { push: false, email: true } },
    });
    expect(saved.groups.likes).toEqual({ push: false, email: true });
    expect((await as(member).notifications.preferences()).groups.likes).toEqual({ push: false, email: true });
  });

  it("registers and removes a push subscription for the signed-in member only", async () => {
    const member = await createTestMember(db);
    const endpoint = `https://push.example/${member}`;
    await as(member).notifications.subscribe({
      endpoint,
      keys: { p256dh: "key", auth: "auth" },
      userAgent: null,
    });
    const other = await createTestMember(db);
    await as(other).notifications.unsubscribe({ endpoint });
    expect(await db.select().from(schema.pushSubscription)).toContainEqual(
      expect.objectContaining({ endpoint, userId: member }),
    );
    await as(member).notifications.unsubscribe({ endpoint });
    expect(await db.select().from(schema.pushSubscription)).not.toContainEqual(
      expect.objectContaining({ endpoint }),
    );
    await expect(as(null).notifications.list({ limit: 5 })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});
