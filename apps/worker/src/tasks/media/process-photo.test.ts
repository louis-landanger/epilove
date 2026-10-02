import { uuidv7 } from "@epilove/core";
import { createDatabase, runSeeds, schema } from "@epilove/db";
import { runMigrations } from "@epilove/db/migrations";
import { photoKey, quarantineKey } from "@epilove/media";
import { createMemoryStorage } from "@epilove/media/storage";
import { eq } from "drizzle-orm";
import type { JobHelpers } from "graphile-worker";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { processPhotoTask } from "./process-photo";
import { purgeUploadsTask } from "./purge-uploads";

const url = process.env.DATABASE_URL;

const helpers = {
  logger: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
} as unknown as JobHelpers;

/** Needs a disposable PostgreSQL (`pnpm services:up` locally, a service container in CI). */
describe.skipIf(!url)("photo pipeline jobs", () => {
  const { db, close } = createDatabase(url ?? "", { maxConnections: 2 });
  const storage = createMemoryStorage();
  const dependencies = { database: () => db, storage: () => storage };
  const processPhoto = processPhotoTask(dependencies);

  beforeAll(async () => {
    await runMigrations(db);
    await runSeeds(db);
  });
  afterAll(close);

  async function member() {
    const [school] = await db.select({ id: schema.school.id }).from(schema.school).limit(1);
    const id = uuidv7();
    await db.insert(schema.appUser).values({
      id,
      schoolId: school?.id ?? "",
      email: `worker.${id}@epita.fr`,
      emailHmac: `worker-${id}`,
    });
    return id;
  }

  async function queuedPhoto(
    userId: string,
    body: Uint8Array,
    stage: "processing" | "uploading" = "processing",
  ) {
    const id = uuidv7();
    const key = quarantineKey(userId, id);
    await storage.write(key, body, "image/jpeg");
    await db.insert(schema.photo).values({ id, userId, storageKey: key, position: 0, stage });
    return id;
  }

  async function photoRow(id: string) {
    const [row] = await db.select().from(schema.photo).where(eq(schema.photo.id, id));
    return row;
  }

  it("publishes a clean WebP and removes the quarantined original", async () => {
    const userId = await member();
    const jpeg = await sharp({ create: { width: 900, height: 1200, channels: 3, background: "#cc2277" } })
      .withExif({ IFD0: { Model: "Secret" } })
      .jpeg()
      .toBuffer();
    const id = await queuedPhoto(userId, new Uint8Array(jpeg));

    await processPhoto({ photoId: id }, helpers);

    const row = await photoRow(id);
    expect(row).toMatchObject({ stage: "ready", status: "pending", width: 900, height: 1200 });
    expect(row?.storageKey).toBe(photoKey(userId, id));
    expect(row?.thumbhash).toBeTruthy();
    expect(storage.objects.has(quarantineKey(userId, id))).toBe(false);
    const published = storage.objects.get(photoKey(userId, id));
    expect(published && (await sharp(published).metadata()).exif).toBeUndefined();

    // Running the job again changes nothing.
    await processPhoto({ photoId: id }, helpers);
    expect((await photoRow(id))?.stage).toBe("ready");
  });

  it("marks files that are not photos as failed", async () => {
    const userId = await member();
    const id = await queuedPhoto(userId, new TextEncoder().encode("<script>alert(1)</script>"));
    await processPhoto({ photoId: id }, helpers);
    expect(await photoRow(id)).toMatchObject({ stage: "failed", moderation: { processing: "unreadable" } });
    expect(storage.objects.has(quarantineKey(userId, id))).toBe(false);
  });

  it("fails, without retrying, when the original is missing", async () => {
    const userId = await member();
    const id = await queuedPhoto(userId, new Uint8Array(10));
    await storage.remove(quarantineKey(userId, id));
    await processPhoto({ photoId: id }, helpers);
    expect(await photoRow(id)).toMatchObject({ stage: "failed", moderation: { processing: "missing" } });
  });

  it("purges uploads that were never confirmed", async () => {
    const userId = await member();
    const id = await queuedPhoto(userId, new Uint8Array(10), "uploading");
    await db
      .update(schema.photo)
      .set({ createdAt: new Date(Date.now() - 2 * 3600 * 1000) })
      .where(eq(schema.photo.id, id));
    const fresh = await queuedPhoto(userId, new Uint8Array(10), "uploading");

    await purgeUploadsTask(dependencies)({}, helpers);

    expect(await photoRow(id)).toBeUndefined();
    expect(storage.objects.has(quarantineKey(userId, id))).toBe(false);
    expect(await photoRow(fresh)).toBeDefined();
  });
});
