import { randomUUID } from "node:crypto";
import { createDatabase, schema } from "@atomes/db";
import { scheduleMediaDeletion } from "@atomes/db/repositories/messaging";
import { createMemoryObjectStore, type ObjectStore } from "@atomes/db/storage";
import { prepareTestDatabase } from "@atomes/db/testing";
import { inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { purgeDueMedia } from "./purge";

const url = process.env.DATABASE_URL;

describe.skipIf(!url)("media purge (CHAT-06, CHAT-07)", () => {
  const { db, close } = createDatabase(url ?? "", { maxConnections: 2 });
  const keys = [0, 1, 2].map((i) => `chat/test-${randomUUID()}/${i}.jpg`);
  beforeAll(() => prepareTestDatabase(db));
  afterAll(async () => {
    await db.delete(schema.mediaDeletion).where(inArray(schema.mediaDeletion.storageKey, keys));
    await close();
  });

  it("deletes due media only, and retries a failed deletion", async () => {
    const [due, later, failing] = keys as [string, string, string];
    const { store, objects } = createMemoryObjectStore();
    for (const key of keys) {
      await store.put(key, new Uint8Array([1]), "image/jpeg");
    }
    const now = new Date();
    await scheduleMediaDeletion(db, [due, failing], new Date(now.getTime() - 1000));
    await scheduleMediaDeletion(db, [later], new Date(now.getTime() + 60_000));
    const flaky: ObjectStore = {
      ...store,
      delete: async (key) => {
        if (key === failing) {
          throw new Error("unavailable");
        }
        await store.delete(key);
      },
    };

    await purgeDueMedia(db, flaky, now);
    expect(objects.has(due)).toBe(false);
    expect(objects.has(later)).toBe(true);
    expect(objects.has(failing)).toBe(true);
    const queued = await db
      .select({ key: schema.mediaDeletion.storageKey })
      .from(schema.mediaDeletion)
      .where(inArray(schema.mediaDeletion.storageKey, keys));
    expect(queued.map((q) => q.key).sort()).toEqual([failing, later].sort());

    await purgeDueMedia(db, store, now);
    expect(objects.has(failing)).toBe(false);
  });
});
