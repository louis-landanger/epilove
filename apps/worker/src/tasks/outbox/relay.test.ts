import { createDatabase, schema } from "@epilove/db";
import { enqueue } from "@epilove/db/repositories/outbox";
import { cleanupTestMembers, createTestMember, prepareTestDatabase } from "@epilove/db/testing";
import { createMemoryPublisher, personalChannel } from "@epilove/realtime";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startOutboxRelay } from "./relay";

const url = process.env.DATABASE_URL;

describe.skipIf(!url)("outbox relay", () => {
  const { db, close } = createDatabase(url ?? "", { maxConnections: 4 });
  beforeAll(() => prepareTestDatabase(db));
  afterAll(async () => {
    await cleanupTestMembers(db);
    await close();
  });

  it("publishes committed events to the recipients' personal channels, once", async () => {
    const member = await createTestMember(db);
    const matchId = "01920000-0000-7000-8000-00000000abcd";
    const { publisher, published } = createMemoryPublisher();
    const relay = await startOutboxRelay({ db, databaseUrl: url ?? "", publisher, pollIntervalMs: 60_000 });
    try {
      await db.transaction(async (tx) => {
        await enqueue(tx, [{ userId: member, event: { type: "match.created", matchId } }]);
      });
      // The NOTIFY wakes the relay up; wait for it.
      for (let i = 0; i < 50 && !published.some((p) => p.channel === personalChannel(member)); i++) {
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      expect(published.filter((p) => p.channel === personalChannel(member))).toEqual([
        { channel: personalChannel(member), event: { type: "match.created", matchId } },
      ]);
      await relay.drain();
      expect(published.filter((p) => p.channel === personalChannel(member))).toHaveLength(1);
      const rows = await db
        .select({ publishedAt: schema.outbox.publishedAt })
        .from(schema.outbox)
        .where(eq(schema.outbox.topic, "match.created"));
      expect(rows.some((r) => r.publishedAt !== null)).toBe(true);
    } finally {
      await relay.stop();
    }
  });

  it("keeps events pending when publishing fails", async () => {
    const member = await createTestMember(db);
    await enqueue(db, [{ userId: member, event: { type: "notification.created" } }]);
    let calls = 0;
    const relay = await startOutboxRelay({
      db,
      databaseUrl: url ?? "",
      pollIntervalMs: 60_000,
      publisher: {
        publish: async () => {
          calls++;
          throw new Error("down");
        },
        presenceCount: async () => 0,
        isOnline: async () => false,
      },
    });
    await relay.stop();
    expect(calls).toBeGreaterThan(0);
    const pending = await db
      .select({ id: schema.outbox.id })
      .from(schema.outbox)
      .where(inArray(schema.outbox.topic, ["notification.created"]));
    expect(pending.length).toBeGreaterThan(0);
  });
});
