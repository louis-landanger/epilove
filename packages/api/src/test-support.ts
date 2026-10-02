import { createApiClient } from "@epilove/contracts/client";
import { uuidv7 } from "@epilove/core";
import type { KeyRing } from "@epilove/crypto";
import { createDatabase, type Database, runSeeds, schema } from "@epilove/db";
import { runJobQueueSchemaMigrations, runMigrations } from "@epilove/db/migrations";
import { createMemoryMailer } from "@epilove/email";
import { createMemoryStorage } from "@epilove/media/storage";
import { createMemoryRateLimiter } from "@epilove/rate-limit";
import { eq } from "drizzle-orm";
import { vi } from "vitest";
import { createApp } from "./app";

export const TEST_KEY_RING: KeyRing = {
  currentKeyId: "test",
  keys: new Map([["test", new Uint8Array(32).fill(7)]]),
};

export const TEST_SONG = {
  provider: "itunes" as const,
  trackId: "42",
  title: "Une seule vie",
  artist: "Angèle",
  artworkUrl: "https://is1-ssl.mzstatic.com/image/thumb/x/300x300bb.jpg",
  previewUrl: "https://audio-ssl.itunes.apple.com/preview.m4a",
  trackViewUrl: "https://music.apple.com/fr/album/x?i=42",
};

const TEST_MUSIC = {
  search: async () => [TEST_SONG],
  lookup: async (trackId: string) => (trackId === TEST_SONG.trackId ? TEST_SONG : null),
};

/** API wired to a real database and in-memory services, for integration tests. */
export function createTestApi(url: string, now = new Date("2026-10-02T10:00:00Z")) {
  const { db, close } = createDatabase(url, { maxConnections: 4 });
  const storage = createMemoryStorage();
  const revokeSessions = vi.fn(async (_userId: string) => {});
  const mailer = createMemoryMailer();
  const app = createApp({
    version: "test",
    database: () => db,
    resolveViewer: async (request) => {
      const userId = request.headers.get("x-test-user");
      const role = request.headers.get("x-test-role");
      return userId ? { userId, role: role === "moderator" || role === "admin" ? role : "user" } : null;
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
      keyRing: () => TEST_KEY_RING,
      mailer: () => mailer,
      appUrl: () => "http://app.test",
      music: () => TEST_MUSIC,
      now: () => now,
    },
  });

  const clientFor = (userId: string, role: "user" | "moderator" | "admin" = "user") =>
    createApiClient({
      url: "http://localhost/api/rpc",
      fetch: (request) => {
        const headers = new Headers(request.headers);
        headers.set("x-test-user", userId);
        headers.set("x-test-role", role);
        return Promise.resolve(app.fetch(new Request(request, { headers })));
      },
    });

  async function prepare() {
    await runMigrations(db);
    await runJobQueueSchemaMigrations(url);
    await runSeeds(db);
  }

  return { db, close, storage, revokeSessions, mailer, app, clientFor, prepare };
}

export async function insertMember(db: Database, status: "onboarding" | "active" = "onboarding") {
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
    status,
  });
  return id;
}

/** An active member with a minimal profile, as the onboarding leaves it. */
export async function insertActiveMember(db: Database) {
  const id = await insertMember(db, "active");
  await db.insert(schema.profile).values({
    userId: id,
    firstName: "Alex",
    birthDate: "2003-02-10",
    gender: "man",
    graduationYear: 2028,
  });
  await db.insert(schema.preferences).values({ userId: id, modes: ["friends"] });
  return id;
}
