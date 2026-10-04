import { uuidv7 } from "@atomes/core";
import { createDatabase, runSeeds, schema } from "@atomes/db";
import { runMigrations } from "@atomes/db/migrations";
import { quarantineKey, selfieKey } from "@atomes/media";
import { createMemoryStorage } from "@atomes/media/storage";
import { eq } from "drizzle-orm";
import type { JobHelpers } from "graphile-worker";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { processSelfieTask } from "./process-selfie";
import { purgeUploadsTask } from "./purge-uploads";

const url = process.env.DATABASE_URL;

const helpers = {
  logger: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
} as unknown as JobHelpers;

/** Needs a disposable PostgreSQL (`pnpm services:up` locally, a service container in CI). */
describe.skipIf(!url)("verification selfies (ONB-08)", () => {
  const { db, close } = createDatabase(url ?? "", { maxConnections: 2 });
  const storage = createMemoryStorage();
  const dependencies = { database: () => db, storage: () => storage };
  const processSelfie = processSelfieTask(dependencies);

  beforeAll(async () => {
    await runMigrations(db);
    await runSeeds(db);
  });
  afterAll(close);

  async function attempt(status: "processing" | "uploading", body?: Uint8Array) {
    const [school] = await db.select({ id: schema.school.id }).from(schema.school).limit(1);
    const userId = uuidv7();
    await db.insert(schema.appUser).values({
      id: userId,
      schoolId: school?.id ?? "",
      email: `selfie.${userId}@epita.fr`,
      emailHmac: `selfie-${userId}`,
    });
    const id = uuidv7();
    const key = quarantineKey(userId, id);
    if (body) {
      await storage.write(key, body, "image/jpeg");
    }
    await db
      .insert(schema.photoVerification)
      .values({ id, userId, gesture: "peace", status, storageKey: key });
    return { id, userId };
  }

  async function row(id: string) {
    const [found] = await db
      .select()
      .from(schema.photoVerification)
      .where(eq(schema.photoVerification.id, id));
    return found;
  }

  it("stores a clean, private WebP and queues it for review", async () => {
    const jpeg = await sharp({ create: { width: 800, height: 1000, channels: 3, background: "#2277cc" } })
      .withExif({ IFD0: { Model: "Secret" } })
      .jpeg()
      .toBuffer();
    const { id, userId } = await attempt("processing", new Uint8Array(jpeg));

    await processSelfie({ verificationId: id }, helpers);

    expect(await row(id)).toMatchObject({ status: "pending", storageKey: selfieKey(userId, id) });
    expect(storage.objects.has(quarantineKey(userId, id))).toBe(false);
    const stored = storage.objects.get(selfieKey(userId, id));
    expect(stored && (await sharp(stored).metadata()).exif).toBeUndefined();
    await processSelfie({ verificationId: id }, helpers);
    expect((await row(id))?.status).toBe("pending");
  });

  it("fails an unreadable or missing selfie, and purges abandoned attempts", async () => {
    const broken = await attempt("processing", new TextEncoder().encode("not an image"));
    await processSelfie({ verificationId: broken.id }, helpers);
    expect(await row(broken.id)).toMatchObject({ status: "failed", storageKey: null });

    const missing = await attempt("processing");
    await processSelfie({ verificationId: missing.id }, helpers);
    expect((await row(missing.id))?.status).toBe("failed");

    const stale = await attempt("uploading", new Uint8Array([1, 2, 3]));
    const old = new Date(Date.now() - 2 * 3_600_000);
    for (const id of [broken.id, missing.id, stale.id]) {
      await db
        .update(schema.photoVerification)
        .set({ updatedAt: old })
        .where(eq(schema.photoVerification.id, id));
    }
    await purgeUploadsTask(dependencies)({}, helpers);
    expect(await row(stale.id)).toBeUndefined();
    expect(await row(broken.id)).toBeUndefined();
    expect(storage.objects.has(quarantineKey(stale.userId, stale.id))).toBe(false);
  });
});
