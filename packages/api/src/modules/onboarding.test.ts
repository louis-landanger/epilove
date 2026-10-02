import { createApiClient } from "@epilove/contracts/client";
import { uuidv7 } from "@epilove/core";
import { createDatabase, runSeeds, schema } from "@epilove/db";
import { runJobQueueSchemaMigrations, runMigrations } from "@epilove/db/migrations";
import { markPhotoProcessed } from "@epilove/db/repositories/profiles";
import { createMemoryStorage } from "@epilove/media/storage";
import { createMemoryRateLimiter } from "@epilove/rate-limit";
import { and, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createApp } from "../app";

const url = process.env.DATABASE_URL;

/** Needs a disposable PostgreSQL (`pnpm services:up` locally, a service container in CI). */
describe.skipIf(!url)("onboarding and photos", () => {
  const { db, close } = createDatabase(url ?? "", { maxConnections: 4 });
  const storage = createMemoryStorage();
  const revokeSessions = vi.fn(async (_userId: string) => {});
  const now = new Date("2026-10-02T10:00:00Z");

  const app = createApp({
    version: "test",
    database: () => db,
    resolveViewer: async (request) => {
      const userId = request.headers.get("x-test-user");
      return userId ? { userId, role: "user" } : null;
    },
    services: {
      storage: () => storage,
      imgproxy: () => ({
        baseUrl: "http://img.test",
        keyHex: "6b6579",
        saltHex: "73616c74",
        bucket: storage.bucket,
      }),
      limiter: createMemoryRateLimiter(),
      revokeSessions,
      emailHmacSecret: () => "test-only-email-hmac-secret-32-characters",
      keyRing: () => ({ currentKeyId: "test", keys: new Map([["test", new Uint8Array(32).fill(7)]]) }),
      now: () => now,
    },
  });

  const clientFor = (userId: string) =>
    createApiClient({
      url: "http://localhost/api/rpc",
      fetch: (request) => {
        const headers = new Headers(request.headers);
        headers.set("x-test-user", userId);
        return Promise.resolve(app.fetch(new Request(request, { headers })));
      },
    });

  async function createMember() {
    const [school] = await db
      .select({ id: schema.school.id })
      .from(schema.school)
      .where(eq(schema.school.slug, "epita"));
    const id = uuidv7();
    await db.insert(schema.appUser).values({
      id,
      schoolId: school?.id ?? "",
      email: `test.${id}@epita.fr`,
      emailHmac: `hmac-${id}`,
      emailVerified: true,
      status: "onboarding",
    });
    return id;
  }

  const confirmedPhotos: string[] = [];

  async function uploadPhoto(client: ReturnType<typeof clientFor>) {
    const { photoId, upload } = await client.media.requestUpload({ contentType: "image/jpeg", size: 1000 });
    await storage.write(upload.fields.key ?? "", new Uint8Array(1000), "image/jpeg");
    confirmedPhotos.push(photoId);
    return client.media.confirmUpload({ photoId });
  }

  beforeAll(async () => {
    await runMigrations(db);
    await runJobQueueSchemaMigrations(url ?? "");
    await runSeeds(db);
  });
  afterAll(async () => {
    // The photos only exist in the in-memory storage: drop their processing jobs.
    for (const photoId of confirmedPhotos) {
      await db.execute(sql`select graphile_worker.remove_job(${`photo:${photoId}`})`);
    }
    await close();
  });

  it("walks through every step, resumes, and activates the account", async () => {
    const userId = await createMember();
    const client = clientFor(userId);

    const initial = await client.onboarding.state();
    expect(initial.step).toBe("charter");
    expect(initial.missing).toHaveLength(10);
    expect(initial.schoolSlug).toBe("epita");
    expect(initial.graduationYears).toEqual({ min: 2027, max: 2032 });

    expect((await client.onboarding.save({ step: "charter", accepted: true })).step).toBe("name");
    const consents = await db
      .select({ kind: schema.consent.kind })
      .from(schema.consent)
      .where(eq(schema.consent.userId, userId));
    expect(consents.map((row) => row.kind).sort()).toEqual(["privacy", "terms"]);

    await expect(client.onboarding.save({ step: "name", firstName: "@camille" })).rejects.toMatchObject({
      code: "INVALID_VALUE",
      data: { field: "firstName" },
    });
    const named = await client.onboarding.save({ step: "name", firstName: "  camille " });
    expect(named.answers.firstName).toBe("camille");

    await expect(client.onboarding.save({ step: "birth", birthDate: "2005-02-30" })).rejects.toMatchObject({
      code: "INVALID_VALUE",
      data: { field: "birthDate" },
    });
    await client.onboarding.save({ step: "birth", birthDate: "2005-04-12" });
    await client.onboarding.save({ step: "gender", gender: "woman", pronouns: " elle " });

    // Love mode without the sensitive-data consent falls back to Friends.
    await client.onboarding.save({
      step: "seeking",
      modes: ["love", "friends"],
      intentions: ["relationship"],
    });
    const refused = await client.onboarding.save({
      step: "audience",
      ageMin: 19,
      ageMax: 26,
      sensitiveConsent: false,
      interestedIn: ["man"],
    });
    expect(refused.answers.modes).toEqual(["friends"]);
    expect(refused.answers.interestedIn).toEqual([]);
    expect(refused.answers.sensitiveConsent).toBe(false);

    await client.onboarding.save({
      step: "seeking",
      modes: ["love", "friends"],
      intentions: ["relationship"],
    });
    await expect(
      client.onboarding.save({
        step: "audience",
        ageMin: 19,
        ageMax: 26,
        sensitiveConsent: true,
        interestedIn: [],
      }),
    ).rejects.toMatchObject({ code: "INVALID_VALUE", data: { field: "interestedIn" } });
    const accepted = await client.onboarding.save({
      step: "audience",
      ageMin: 19,
      ageMax: 26,
      sensitiveConsent: true,
      interestedIn: ["man", "nonbinary"],
    });
    expect(accepted.answers).toMatchObject({
      modes: ["love", "friends"],
      interestedIn: ["man", "nonbinary"],
      sensitiveConsent: true,
      ageMin: 19,
      ageMax: 26,
    });
    expect(accepted.step).toBe("photos");

    // Photos: presigned upload, confirmation, processing job queued.
    const first = await uploadPhoto(client);
    expect(first.stage).toBe("processing");
    expect(first.url).toBeNull();
    const [job] = await db.execute<{ task_identifier: string }>(
      sql`select task_identifier from graphile_worker.jobs where key = ${`photo:${first.id}`}`,
    );
    expect(job?.task_identifier).toBe("media/process-photo");
    await uploadPhoto(client);
    await markPhotoProcessed(db, first.id, {
      storageKey: `photos/${userId}/${first.id}.webp`,
      width: 1200,
      height: 1500,
      thumbhash: "abc",
    });
    const listed = await client.media.list();
    expect(listed.photos.map((photo) => photo.stage)).toEqual(["ready", "processing"]);
    expect(listed.photos[0]?.url).toMatch(/^http:\/\/img\.test\//);

    const catalog = await client.profile.catalog();
    expect(catalog.prompts.length).toBeGreaterThanOrEqual(40);
    expect(catalog.interests.length).toBeGreaterThanOrEqual(80);
    const [p1, p2, p3] = catalog.prompts;
    const answers = [p1, p2, p3].map((prompt, index) => ({
      promptId: prompt?.id ?? "",
      text: `Réponse ${index}`,
    }));
    await expect(
      client.onboarding.save({
        step: "prompts",
        answers: answers.map((answer, index) =>
          index === 1 ? { ...answer, text: "x".repeat(201) } : answer,
        ),
      }),
    ).rejects.toMatchObject({ code: "INVALID_VALUE", data: { field: "answers.1" } });
    await client.onboarding.save({ step: "prompts", answers });

    await client.onboarding.save({
      step: "interests",
      interestIds: catalog.interests.slice(0, 4).map((item) => item.id),
    });

    await expect(
      client.onboarding.save({
        step: "campus",
        graduationYear: 2040,
        program: null,
        onCampus: true,
        student: true,
      }),
    ).rejects.toMatchObject({ code: "INVALID_VALUE", data: { field: "graduationYear" } });
    const done = await client.onboarding.save({
      step: "campus",
      graduationYear: 2028,
      program: "  Cycle   ingénieur ",
      onCampus: true,
      student: true,
    });
    expect(done.step).toBeNull();
    expect(done.answers.program).toBe("Cycle ingénieur");

    await expect(client.onboarding.complete()).resolves.toEqual({ ok: true });

    const [account] = await db
      .select({
        status: schema.appUser.status,
        name: schema.appUser.name,
        reverify: schema.appUser.reverifyDueAt,
      })
      .from(schema.appUser)
      .where(eq(schema.appUser.id, userId));
    expect(account).toMatchObject({ status: "active", name: "camille" });
    expect(account?.reverify?.toISOString()).toBe("2027-10-01T00:00:00.000Z");
    const [profile] = await db.select().from(schema.profile).where(eq(schema.profile.userId, userId));
    expect(profile).toMatchObject({
      firstName: "camille",
      birthDate: "2005-04-12",
      gender: "woman",
      pronouns: "elle",
      graduationYear: 2028,
      intentions: ["relationship"],
    });
    const drafts = await db
      .select()
      .from(schema.onboardingDraft)
      .where(eq(schema.onboardingDraft.userId, userId));
    expect(drafts).toEqual([]);

    // Once active, onboarding is closed and the photo minimum is enforced.
    await expect(client.onboarding.state()).rejects.toMatchObject({ code: "NOT_ONBOARDING" });
    await expect(client.media.remove({ photoId: first.id })).rejects.toMatchObject({ code: "MIN_PHOTOS" });
  });

  it("deletes the account of a minor and blocks the address until 18", async () => {
    const userId = await createMember();
    const client = clientFor(userId);
    await client.onboarding.save({ step: "charter", accepted: true });

    await expect(client.onboarding.save({ step: "birth", birthDate: "2010-03-15" })).rejects.toMatchObject({
      code: "UNDERAGE",
    });
    const remaining = await db.select().from(schema.appUser).where(eq(schema.appUser.id, userId));
    expect(remaining).toEqual([]);
    const [block] = await db
      .select({ until: schema.signupBlock.until, reason: schema.signupBlock.reason })
      .from(schema.signupBlock)
      .where(eq(schema.signupBlock.emailHmac, `hmac-${userId}`));
    expect(block).toEqual({ until: "2028-03-15", reason: "underage" });
    expect(revokeSessions).toHaveBeenCalledWith(userId);
  });

  it("limits photo slots, validates reordering and keeps positions compact", async () => {
    const userId = await createMember();
    const client = clientFor(userId);
    const ids: string[] = [];
    for (let index = 0; index < 6; index++) {
      ids.push((await uploadPhoto(client)).id);
    }
    await expect(client.media.requestUpload({ contentType: "image/png", size: 10 })).rejects.toMatchObject({
      code: "TOO_MANY_PHOTOS",
    });

    const reversed = [...ids].reverse();
    const reordered = await client.media.reorder({ photoIds: reversed });
    expect(reordered.photos.map((photo) => photo.id)).toEqual(reversed);
    await expect(client.media.reorder({ photoIds: reversed.slice(1) })).rejects.toMatchObject({
      code: "INVALID_ORDER",
    });

    const afterRemoval = await client.media.remove({ photoId: reversed[0] ?? "" });
    expect(afterRemoval.photos.map((photo) => photo.position)).toEqual([0, 1, 2, 3, 4]);
    expect(storage.objects.has(`quarantine/${userId}/${reversed[0]}`)).toBe(false);

    // Someone else's photo is invisible.
    const other = clientFor(await createMember());
    await expect(other.media.remove({ photoId: ids[0] ?? "" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(other.media.confirmUpload({ photoId: ids[0] ?? "" })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("refuses to confirm an upload that never reached the storage", async () => {
    const client = clientFor(await createMember());
    const { photoId } = await client.media.requestUpload({ contentType: "image/webp", size: 10 });
    await expect(client.media.confirmUpload({ photoId })).rejects.toMatchObject({ code: "UPLOAD_MISSING" });
    const [row] = await db
      .select({ stage: schema.photo.stage })
      .from(schema.photo)
      .where(and(eq(schema.photo.id, photoId)));
    expect(row?.stage).toBe("uploading");
  });

  it("requires a signed-in member", async () => {
    const anonymous = createApiClient({
      url: "http://localhost/api/rpc",
      fetch: (request) => Promise.resolve(app.fetch(request)),
    });
    await expect(anonymous.onboarding.state()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(anonymous.media.list()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});
