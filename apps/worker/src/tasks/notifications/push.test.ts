import { createDatabase, schema } from "@epilove/db";
import {
  processPendingPushes,
  saveNotificationPreferences,
  saveSubscription,
} from "@epilove/db/repositories/notifications";
import { cleanupTestMembers, createTestMember, prepareTestDatabase } from "@epilove/db/testing";
import type { PushContent, PushSender, PushTarget } from "@epilove/notifications";
import { createMemoryPublisher } from "@epilove/realtime";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPushDelivery } from "./push";

const url = process.env.DATABASE_URL;

describe.skipIf(!url)("push delivery", () => {
  const { db, close } = createDatabase(url ?? "", { maxConnections: 4 });
  beforeAll(() => prepareTestDatabase(db));
  afterAll(async () => {
    await cleanupTestMembers(db);
    await close();
  });

  function recordingSender(gone: Set<string> = new Set()) {
    const sent: { target: PushTarget; content: PushContent }[] = [];
    const sender: PushSender = {
      async send(target, content) {
        if (gone.has(target.endpoint)) {
          return "gone";
        }
        sent.push({ target, content });
        return "sent";
      },
    };
    return { sender, sent };
  }

  it("pushes discreetly, respects preferences and drops expired subscriptions", async () => {
    const member = await createTestMember(db);
    const endpoint = `https://push.example/${member}`;
    const expired = `https://push.example/${member}/expired`;
    await saveSubscription(db, member, { endpoint, p256dh: "k", auth: "a", userAgent: null });
    await saveSubscription(db, member, { endpoint: expired, p256dh: "k", auth: "a", userAgent: null });
    await saveNotificationPreferences(db, member, new Map([["likes", { push: false, email: false }]]));
    await db.insert(schema.notification).values([
      {
        userId: member,
        type: "message_received",
        payload: { matchId: "01920000-0000-7000-8000-000000000001" },
      },
      { userId: member, type: "like_received", payload: {} },
    ]);

    const { sender, sent } = recordingSender(new Set([expired]));
    const deliver = createPushDelivery({ db, sender, publisher: createMemoryPublisher().publisher });
    // Other tests may leave pending notifications: only ours are checked.
    while ((await processPendingPushes(db, deliver)) > 0) {}

    const mine = sent.filter((s) => s.target.endpoint === endpoint);
    expect(mine.map((s) => s.content.body)).toEqual(["Nouveau message"]);
    const subscriptions = await db
      .select()
      .from(schema.pushSubscription)
      .where(eq(schema.pushSubscription.userId, member));
    expect(subscriptions.map((s) => s.endpoint)).toEqual([endpoint]);
    const pending = await db.select().from(schema.notification).where(eq(schema.notification.userId, member));
    expect(pending.every((n) => n.pushedAt !== null)).toBe(true);
  });

  it("does not push to a member who is online", async () => {
    const member = await createTestMember(db);
    await saveSubscription(db, member, {
      endpoint: `https://push.example/${member}`,
      p256dh: "k",
      auth: "a",
      userAgent: null,
    });
    await db.insert(schema.notification).values({ userId: member, type: "match_created", payload: {} });
    const { sender, sent } = recordingSender();
    const online = createMemoryPublisher().publisher;
    online.isOnline = async () => true;
    const deliver = createPushDelivery({ db, sender, publisher: online });
    while ((await processPendingPushes(db, deliver)) > 0) {}
    expect(sent.filter((s) => s.target.endpoint.includes(member))).toEqual([]);
  });
});
