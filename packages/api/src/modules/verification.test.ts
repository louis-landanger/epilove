import { uuidv7 } from "@epilove/core";
import { schema } from "@epilove/db";
import { quarantineKey, selfieKey } from "@epilove/media";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestApi, insertActiveMember } from "../test-support";

const url = process.env.DATABASE_URL;

/** Needs a disposable PostgreSQL (`pnpm services:up` locally, a service container in CI). */
describe.skipIf(!url)("photo verification by gesture (ONB-08)", () => {
  const api = createTestApi(url ?? "");
  beforeAll(api.prepare);
  afterAll(api.close);

  async function readyPhoto(userId: string) {
    const id = uuidv7();
    await api.db.insert(schema.photo).values({
      id,
      userId,
      storageKey: `photos/${userId}/${id}.webp`,
      position: 0,
      stage: "ready",
    });
  }

  /** What the worker does (tested in apps/worker): the selfie becomes reviewable. */
  async function processed(userId: string, id: string) {
    await api.db.execute(sql`select graphile_worker.remove_job(${`selfie:${id}`})`);
    const key = selfieKey(userId, id);
    await api.storage.write(key, new Uint8Array([1, 2, 3]), "image/webp");
    await api.db
      .update(schema.photoVerification)
      .set({ status: "pending", storageKey: key })
      .where(eq(schema.photoVerification.id, id));
    return key;
  }

  it("draws a gesture, takes the selfie and gets the badge once a moderator approves", async () => {
    const me = await insertActiveMember(api.db);
    const client = api.clientFor(me);
    expect((await client.verification.state()).blocker).toBe("no_photo");
    await expect(client.verification.start()).rejects.toMatchObject({ code: "NO_PHOTO" });

    await readyPhoto(me);
    const attempt = await client.verification.start();
    expect(attempt.status).toBe("uploading");
    expect(new Date(attempt.expiresAt).getTime() - new Date(attempt.createdAt).getTime()).toBe(15 * 60_000);

    const upload = await client.verification.requestUpload({
      id: attempt.id,
      contentType: "image/jpeg",
      size: 1000,
    });
    expect(upload.fields.key).toBe(quarantineKey(me, attempt.id));
    await expect(client.verification.submit({ id: attempt.id })).rejects.toMatchObject({
      code: "UPLOAD_MISSING",
    });
    await api.storage.write(quarantineKey(me, attempt.id), new Uint8Array([1]), "image/jpeg");
    const submitted = await client.verification.submit({ id: attempt.id });
    expect(submitted.latest?.status).toBe("processing");
    expect(submitted.blocker).toBe("in_review");
    const [job] = await api.db.execute<{ task_identifier: string }>(
      sql`select task_identifier from graphile_worker.jobs where key = ${`selfie:${attempt.id}`}`,
    );
    expect(job?.task_identifier).toBe("media/process-selfie");
    const key = await processed(me, attempt.id);

    // Nobody else can touch the attempt.
    const other = api.clientFor(await insertActiveMember(api.db));
    await expect(other.verification.submit({ id: attempt.id })).rejects.toMatchObject({ code: "NOT_FOUND" });

    const moderator = api.clientFor(await insertActiveMember(api.db), "moderator");
    await expect(other.admin.verificationQueue()).rejects.toMatchObject({ code: "FORBIDDEN" });
    const queue = await moderator.admin.verificationQueue();
    const item = queue.verifications.find((entry) => entry.id === attempt.id);
    expect(item?.gesture).toBe(attempt.gesture);
    expect(item?.photos).toHaveLength(1);
    expect(item?.member.pseudonym).toMatch(/^M-/);
    expect((await moderator.admin.overview()).pendingVerifications).toBeGreaterThanOrEqual(1);

    await moderator.admin.reviewVerification({ id: attempt.id, decision: "approve" });
    await expect(
      moderator.admin.reviewVerification({ id: attempt.id, decision: "approve" }),
    ).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    expect(api.storage.objects.has(key)).toBe(false);
    const [row] = await api.db
      .select({ storageKey: schema.photoVerification.storageKey, status: schema.photoVerification.status })
      .from(schema.photoVerification)
      .where(eq(schema.photoVerification.id, attempt.id));
    expect(row).toEqual({ storageKey: null, status: "approved" });
    const state = await client.verification.state();
    expect(state.verifiedAt).not.toBeNull();
    expect(state.blocker).toBe("verified");
    expect(api.mailer.sent.at(-1)?.email.subject).toContain("Photo vérifiée");
  });

  it("deletes a rejected selfie, allows a new gesture, and limits attempts", async () => {
    const me = await insertActiveMember(api.db);
    await readyPhoto(me);
    const client = api.clientFor(me);
    const moderator = api.clientFor(await insertActiveMember(api.db), "moderator");

    const first = await client.verification.start();
    await api.storage.write(quarantineKey(me, first.id), new Uint8Array([1]), "image/jpeg");
    await client.verification.submit({ id: first.id });
    const key = await processed(me, first.id);
    await moderator.admin.reviewVerification({
      id: first.id,
      decision: "reject",
      reason: "gesture_mismatch",
    });
    expect(api.storage.objects.has(key)).toBe(false);
    const state = await client.verification.state();
    expect(state).toMatchObject({
      verifiedAt: null,
      blocker: null,
      latest: { status: "rejected", rejection: "gesture_mismatch" },
    });

    const second = await client.verification.start();
    expect(second.gesture).not.toBe(first.gesture);
    await client.verification.start();
    expect((await client.verification.state()).blocker).toBe("quota");
    await expect(client.verification.start()).rejects.toMatchObject({ code: "RATE_LIMITED" });
  });
});
