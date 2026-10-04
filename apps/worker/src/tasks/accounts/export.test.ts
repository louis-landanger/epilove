import { uuidv7 } from "@atomes/core";
import { createDatabase, runSeeds, schema } from "@atomes/db";
import { runMigrations } from "@atomes/db/migrations";
import { createMemoryStorage } from "@atomes/media/storage";
import { eq } from "drizzle-orm";
import { strFromU8, unzipSync } from "fflate";
import type { JobHelpers } from "graphile-worker";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { exportTask } from "./export";

const url = process.env.DATABASE_URL;
const helpers = {
  logger: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
} as unknown as JobHelpers;

/** Needs a disposable PostgreSQL (`pnpm services:up` locally, a service container in CI). */
describe.skipIf(!url)("data export", () => {
  const { db, close } = createDatabase(url ?? "", { maxConnections: 2 });
  const storage = createMemoryStorage();
  const now = new Date("2026-10-02T10:00:00Z");

  beforeAll(async () => {
    await runMigrations(db);
    await runSeeds(db);
  });
  afterAll(close);

  it("zips the member's data and photos, without the genders sought", async () => {
    const [school] = await db.select({ id: schema.school.id }).from(schema.school).limit(1);
    const userId = uuidv7();
    await db.insert(schema.appUser).values({
      id: userId,
      schoolId: school?.id ?? "",
      email: `export.${userId}@epita.fr`,
      emailHmac: `export-${userId}`,
      status: "active",
    });
    await db.insert(schema.profile).values({
      userId,
      firstName: "Lina",
      birthDate: "2004-01-01",
      gender: "woman",
      graduationYear: 2027,
    });
    await db.insert(schema.preferences).values({ userId, modes: ["love"], interestedIn: ["woman", "man"] });
    const key = `photos/${userId}/${uuidv7()}.webp`;
    await storage.write(key, new Uint8Array([1, 2, 3]), "image/webp");
    await db
      .insert(schema.photo)
      .values({ userId, storageKey: key, position: 0, stage: "ready", altText: "Au parc" });
    const [row] = await db
      .insert(schema.dataExport)
      .values({ userId })
      .returning({ id: schema.dataExport.id });
    const exportId = row?.id ?? "";

    const sendEmail = vi.fn(async () => {});
    await exportTask({
      database: () => db,
      storage: () => storage,
      now: () => now,
      sendEmail,
      appUrl: "http://app.test",
    })({ exportId }, helpers);

    const [saved] = await db.select().from(schema.dataExport).where(eq(schema.dataExport.id, exportId));
    expect(saved).toMatchObject({ status: "ready", storageKey: `exports/${userId}/${exportId}.zip` });
    expect(saved?.expiresAt?.toISOString()).toBe("2026-10-09T10:00:00.000Z");

    const files = unzipSync(storage.objects.get(saved?.storageKey ?? "") ?? new Uint8Array());
    expect(Object.keys(files).sort()).toEqual(["donnees.json", "photos/1.webp"]);
    const document = JSON.parse(strFromU8(files["donnees.json"] ?? new Uint8Array()));
    expect(document.profile).toMatchObject({ firstName: "Lina", gender: "woman" });
    expect(document.photos).toEqual([expect.objectContaining({ file: "photos/1.webp", altText: "Au parc" })]);
    expect(JSON.stringify(document)).not.toContain("interestedIn");
    expect(sendEmail).toHaveBeenCalledWith(
      `export.${userId}@epita.fr`,
      expect.objectContaining({ text: expect.stringContaining(`http://app.test/api/export/${exportId}`) }),
    );
  });
});
