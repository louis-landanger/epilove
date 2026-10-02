import { createDatabase, schema } from "@epilove/db";
import { enqueue, relayPending } from "@epilove/db/repositories/outbox";
import { cleanupTestMembers, createTestMember, prepareTestDatabase } from "@epilove/db/testing";
import { createMemoryPublisher, PACT_CHANNEL, personalChannel } from "@epilove/realtime";
import { and, isNull, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { publishBatch, startOutboxRelay } from "./relay";

const url = process.env.DATABASE_URL;

describe("publishBatch", () => {
  it("sends personal events to the member's channel and broadcasts to their channel", async () => {
    const seasonId = "01920000-0000-7000-8000-00000000beef";
    const { publisher, published } = createMemoryPublisher();
    await publishBatch(publisher)([
      { id: "e1", userId: "u1", event: { type: "notification.created" } },
      { id: "e2", channel: PACT_CHANNEL, event: { type: "pact.reveal", seasonId } },
    ]);
    expect(published).toEqual([
      { channel: personalChannel("u1"), event: { type: "notification.created" } },
      { channel: "broadcast:pact", event: { type: "pact.reveal", seasonId } },
    ]);
  });
});

/**
 * Another relay may run against the same database (a `pnpm dev` worker):
 * assertions only look at this test's own member, and accept that the other
 * relay may publish first.
 */
describe.skipIf(!url)("outbox relay", () => {
  const { db, close } = createDatabase(url ?? "", { maxConnections: 4 });
  beforeAll(() => prepareTestDatabase(db));
  afterAll(async () => {
    await cleanupTestMembers(db);
    await close();
  });

  const pendingFor = (userId: string) =>
    db
      .select({ id: schema.outbox.id })
      .from(schema.outbox)
      .where(and(isNull(schema.outbox.publishedAt), sql`${schema.outbox.payload}->>'userId' = ${userId}`));

  it("publishes committed events on the recipient's personal channel, at most once", async () => {
    const member = await createTestMember(db);
    const matchId = "01920000-0000-7000-8000-00000000abcd";
    const { publisher, published } = createMemoryPublisher();
    const relay = await startOutboxRelay({ db, databaseUrl: url ?? "", publisher, pollIntervalMs: 60_000 });
    try {
      await db.transaction(async (tx) => {
        await enqueue(tx, [{ userId: member, event: { type: "match.created", matchId } }]);
      });
      for (let i = 0; i < 100 && (await pendingFor(member)).length > 0; i++) {
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      expect(await pendingFor(member)).toEqual([]);
      await relay.drain();
      const mine = published.filter((p) => p.channel === personalChannel(member));
      expect(mine.length).toBeLessThanOrEqual(1);
      for (const p of mine) {
        expect(p.event).toEqual({ type: "match.created", matchId });
      }
    } finally {
      await relay.stop();
    }
  });

  it("leaves events pending when publishing fails, and publishes them on the next run", async () => {
    const member = await createTestMember(db);
    // Inserted without NOTIFY, and relayed right away with a scoped relay.
    await db.insert(schema.outbox).values({
      topic: "notification.created",
      payload: { userId: member, event: { type: "notification.created" } },
    });
    const failing = async () => {
      throw new Error("down");
    };
    const failed = await relayPending(db, failing, { userId: member }).catch(() => "failed");
    const stillPending = (await pendingFor(member)).length;
    if (failed === "failed") {
      expect(stillPending).toBe(1);
    }
    const { publisher, published } = createMemoryPublisher();
    await relayPending(db, publishBatch(publisher), { userId: member });
    expect(await pendingFor(member)).toEqual([]);
    expect(published.filter((p) => p.channel === personalChannel(member)).length).toBeLessThanOrEqual(1);
  });
});
