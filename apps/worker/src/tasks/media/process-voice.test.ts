import { uuidv7 } from "@atomes/core";
import { createDatabase, runSeeds, schema } from "@atomes/db";
import { runMigrations } from "@atomes/db/migrations";
import { quarantineKey } from "@atomes/media";
import { createMemoryStorage } from "@atomes/media/storage";
import { eq } from "drizzle-orm";
import type { JobHelpers } from "graphile-worker";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { processVoiceTask } from "./process-voice";
import { purgeUploadsTask } from "./purge-uploads";

const url = process.env.DATABASE_URL;

const helpers = {
  logger: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
} as unknown as JobHelpers;

const WEBM = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x86, 0x81, 0x01]);

/** Needs a disposable PostgreSQL (`pnpm services:up` locally, a service container in CI). */
describe.skipIf(!url)("voice answers (PRO-06)", () => {
  const { db, close } = createDatabase(url ?? "", { maxConnections: 2 });
  const storage = createMemoryStorage();
  const dependencies = { database: () => db, storage: () => storage };
  const processVoice = processVoiceTask(dependencies);

  beforeAll(async () => {
    await runMigrations(db);
    await runSeeds(db);
  });
  afterAll(close);

  async function voiceAnswer(body: Uint8Array) {
    const [school] = await db.select({ id: schema.school.id }).from(schema.school).limit(1);
    const [prompt] = await db.select({ id: schema.prompt.id }).from(schema.prompt).limit(1);
    const userId = uuidv7();
    await db.insert(schema.appUser).values({
      id: userId,
      schoolId: school?.id ?? "",
      email: `voice.${userId}@epita.fr`,
      emailHmac: `voice-${userId}`,
    });
    const key = quarantineKey(userId, uuidv7());
    await storage.write(key, body, "audio/webm");
    const [row] = await db
      .insert(schema.promptAnswer)
      .values({
        userId,
        promptId: prompt?.id ?? "",
        text: "Transcription.",
        position: 0,
        voiceKey: key,
        voiceStage: "processing",
        voiceContentType: "audio/webm",
        voiceDurationMs: 4200,
        voicePeaks: Array.from({ length: 48 }, () => 50),
      })
      .returning({ id: schema.promptAnswer.id });
    return { id: row?.id ?? "", userId, key };
  }

  async function answer(id: string) {
    const [row] = await db.select().from(schema.promptAnswer).where(eq(schema.promptAnswer.id, id));
    return row;
  }

  it("publishes a real recording under voices/", async () => {
    const { id, userId, key } = await voiceAnswer(WEBM);
    await processVoice({ answerId: id }, helpers);
    const row = await answer(id);
    expect(row?.voiceStage).toBe("ready");
    expect(row?.voiceKey).toMatch(new RegExp(`^voices/${userId}/[0-9a-f-]{36}\\.webm$`));
    expect(storage.objects.has(key)).toBe(false);
    expect(storage.objects.has(row?.voiceKey ?? "")).toBe(true);
  });

  it("refuses a file that is not the declared audio, then purges it but keeps the text", async () => {
    const { id, key } = await voiceAnswer(new TextEncoder().encode("<html>not audio</html>"));
    await processVoice({ answerId: id }, helpers);
    expect(await answer(id)).toMatchObject({ voiceStage: "failed", voiceKey: null });
    expect(storage.objects.has(key)).toBe(false);

    await db
      .update(schema.promptAnswer)
      .set({ updatedAt: new Date(Date.now() - 2 * 3_600_000) })
      .where(eq(schema.promptAnswer.id, id));
    await purgeUploadsTask(dependencies)({}, helpers);
    expect(await answer(id)).toMatchObject({
      voiceStage: null,
      voiceDurationMs: null,
      text: "Transcription.",
    });
  });
});
