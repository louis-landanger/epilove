import { createDatabase, schema } from "@epilove/db";
import {
  processPendingPushes,
  saveNotificationPreferences,
  saveQuietHours,
  saveSubscription,
} from "@epilove/db/repositories/notifications";
import { cleanupTestMembers, createTestMember, prepareTestDatabase } from "@epilove/db/testing";
import type { PushContent, PushSender, PushTarget } from "@epilove/notifications";
import { createMemoryPublisher } from "@epilove/realtime";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPushDelivery } from "./push";

const url = process.env.DATABASE_URL;
/** Midday and half past eleven at night, campus time (quiet hours, NOT-04). */
const NOON = new Date("2026-10-02T10:00:00Z");
const NIGHT = new Date("2026-10-02T21:30:00Z");

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

  it("pushes in the language the member chose (PLT-04)", async () => {
    const member = await createTestMember(db);
    await db.update(schema.appUser).set({ locale: "en" }).where(eq(schema.appUser.id, member));
    const endpoint = `https://push.example/${member}/en`;
    await saveSubscription(db, member, { endpoint, p256dh: "k", auth: "a", userAgent: null });
    await db.insert(schema.notification).values({
      userId: member,
      type: "like_received",
      payload: {},
      createdAt: new Date(Date.now() - 2 * 3_600_000),
    });
    const { sender, sent } = recordingSender();
    const deliver = createPushDelivery({
      db,
      sender,
      publisher: createMemoryPublisher().publisher,
      now: () => NOON,
    });
    while ((await processPendingPushes(db, deliver, { userId: member, maxAgeMinutes: 24 * 60 })) > 0) {}
    expect(sent.filter((s) => s.target.endpoint === endpoint).map((s) => s.content.body)).toEqual([
      "Someone liked you.",
    ]);
  });

  it("pushes discreetly, respects preferences and drops expired subscriptions", async () => {
    const member = await createTestMember(db);
    const endpoint = `https://push.example/${member}`;
    const expired = `https://push.example/${member}/expired`;
    await saveSubscription(db, member, { endpoint, p256dh: "k", auth: "a", userAgent: null });
    await saveSubscription(db, member, { endpoint: expired, p256dh: "k", auth: "a", userAgent: null });
    await saveNotificationPreferences(db, member, new Map([["likes", { push: false, email: false }]]));
    // Two hours old: a development worker running next to the tests (one hour window) leaves them alone.
    const createdAt = new Date(Date.now() - 2 * 3_600_000);
    await db.insert(schema.notification).values([
      {
        userId: member,
        type: "message_received",
        payload: { matchId: "01920000-0000-7000-8000-000000000001" },
        createdAt,
      },
      { userId: member, type: "like_received", payload: {}, createdAt },
    ]);

    const { sender, sent } = recordingSender(new Set([expired]));
    const deliver = createPushDelivery({
      db,
      sender,
      publisher: createMemoryPublisher().publisher,
      now: () => NOON,
    });
    while ((await processPendingPushes(db, deliver, { userId: member, maxAgeMinutes: 24 * 60 })) > 0) {}

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
    const deliver = createPushDelivery({ db, sender, publisher: online, now: () => NOON });
    while ((await processPendingPushes(db, deliver)) > 0) {}
    expect(sent.filter((s) => s.target.endpoint.includes(member))).toEqual([]);
  });

  it("holds pushes during quiet hours, except what the member lets through", async () => {
    const member = await createTestMember(db);
    const endpoint = `https://push.example/${member}`;
    await saveSubscription(db, member, { endpoint, p256dh: "k", auth: "a", userAgent: null });
    await saveQuietHours(db, member, { enabled: true, startHour: 23, endHour: 8, allowMessages: true });
    const createdAt = new Date(Date.now() - 2 * 3_600_000);
    await db.insert(schema.notification).values([
      { userId: member, type: "like_received", payload: {}, createdAt },
      { userId: member, type: "message_received", payload: {}, createdAt },
      { userId: member, type: "chat_nudge", payload: {}, createdAt },
      { userId: member, type: "date_check_in", payload: {}, createdAt },
    ]);
    const { sender, sent } = recordingSender();
    const deliver = createPushDelivery({
      db,
      sender,
      publisher: createMemoryPublisher().publisher,
      now: () => NIGHT,
    });
    while ((await processPendingPushes(db, deliver, { userId: member, maxAgeMinutes: 24 * 60 })) > 0) {}
    expect(sent.filter((s) => s.target.endpoint === endpoint).map((s) => s.content.url)).toEqual([
      "/messages",
      "/messages",
    ]);
    expect(sent.map((s) => s.content.body)).toEqual([
      "Nouveau message",
      "Petite vérification : tout va bien ?",
    ]);
    // Held, not queued: the notifications stay in the centre only.
    const left = await db.select().from(schema.notification).where(eq(schema.notification.userId, member));
    expect(left.every((n) => n.pushedAt !== null)).toBe(true);
  });
});
