import { uuidv7 } from "@atomes/core";
import { createDatabase, runSeeds, schema } from "@atomes/db";
import { runMigrations } from "@atomes/db/migrations";
import { createMemoryStorage } from "@atomes/media/storage";
import { eq, inArray } from "drizzle-orm";
import type { JobHelpers } from "graphile-worker";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { liftSanctionsTask } from "./lift-sanctions";
import { purgeTask } from "./purge";
import { resumePausedTask } from "./resume-paused";
import { reverificationTask } from "./reverification";

const url = process.env.DATABASE_URL;
const helpers = {
  logger: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
} as unknown as JobHelpers;

/** Needs a disposable PostgreSQL (`pnpm services:up` locally, a service container in CI). */
describe.skipIf(!url)("retention purge", () => {
  const { db, close } = createDatabase(url ?? "", { maxConnections: 2 });
  const storage = createMemoryStorage();
  const now = new Date("2026-10-02T03:41:00Z");

  beforeAll(async () => {
    await runMigrations(db);
    await runSeeds(db);
  });
  afterAll(close);

  async function deletedMember(requestedAt: Date) {
    const [school] = await db.select({ id: schema.school.id }).from(schema.school).limit(1);
    const id = uuidv7();
    await db.insert(schema.appUser).values({
      id,
      schoolId: school?.id ?? "",
      email: `purge.${id}@epita.fr`,
      emailHmac: `purge-${id}`,
      status: "deleting",
      deletionRequestedAt: requestedAt,
    });
    const key = `photos/${id}/${uuidv7()}.webp`;
    await storage.write(key, new Uint8Array(4), "image/webp");
    await db.insert(schema.photo).values({ userId: id, storageKey: key, position: 0, stage: "ready" });
    return { id, key };
  }

  it("erases accounts after the grace period, with their photos, and keeps recent ones", async () => {
    const old = await deletedMember(new Date("2026-08-20T00:00:00Z"));
    const recent = await deletedMember(new Date("2026-09-25T00:00:00Z"));
    const vault = uuidv7();
    await db.insert(schema.identityVault).values({
      id: vault,
      formerUserId: old.id,
      email: "former@epita.fr",
      purgeAfter: new Date("2026-10-01T00:00:00Z"),
    });

    await purgeTask({ database: () => db, storage: () => storage, now: () => now })({}, helpers);

    const remaining = await db
      .select({ id: schema.appUser.id })
      .from(schema.appUser)
      .where(inArray(schema.appUser.id, [old.id, recent.id]));
    expect(remaining.map((row) => row.id)).toEqual([recent.id]);
    expect(storage.objects.has(old.key)).toBe(false);
    expect(storage.objects.has(recent.key)).toBe(true);
    expect(await db.select().from(schema.identityVault).where(eq(schema.identityVault.id, vault))).toEqual(
      [],
    );
  });

  it("reinstates members whose suspension is over, not the others", async () => {
    const [school] = await db.select({ id: schema.school.id }).from(schema.school).limit(1);
    const make = async (expiresAt: Date) => {
      const id = uuidv7();
      await db.insert(schema.appUser).values({
        id,
        schoolId: school?.id ?? "",
        email: `sanction.${id}@epita.fr`,
        emailHmac: `sanction-${id}`,
        status: "suspended",
      });
      await db.insert(schema.moderationAction).values({
        targetUserId: id,
        action: "suspension",
        rule: "respect",
        statement: "Test",
        expiresAt,
      });
      return id;
    };
    const lapsed = await make(new Date("2026-10-01T00:00:00Z"));
    const running = await make(new Date("2026-10-20T00:00:00Z"));
    await liftSanctionsTask({ database: () => db, storage: () => storage, now: () => now })({}, helpers);
    const rows = await db
      .select({ id: schema.appUser.id, status: schema.appUser.status })
      .from(schema.appUser)
      .where(inArray(schema.appUser.id, [lapsed, running]));
    expect(Object.fromEntries(rows.map((row) => [row.id, row.status]))).toEqual({
      [lapsed]: "active",
      [running]: "suspended",
    });
  });

  it("ends scheduled pauses once their date has passed", async () => {
    const [school] = await db.select({ id: schema.school.id }).from(schema.school).limit(1);
    const make = async (pausedUntil: Date | null) => {
      const id = uuidv7();
      await db.insert(schema.appUser).values({
        id,
        schoolId: school?.id ?? "",
        email: `pause.${id}@epita.fr`,
        emailHmac: `pause-${id}`,
        status: "paused",
        pausedUntil,
      });
      return id;
    };
    const over = await make(new Date("2026-10-01T00:00:00Z"));
    const running = await make(new Date("2026-10-15T00:00:00Z"));
    const openEnded = await make(null);
    await resumePausedTask({ database: () => db, storage: () => storage, now: () => now })({}, helpers);
    const rows = await db
      .select({ id: schema.appUser.id, status: schema.appUser.status })
      .from(schema.appUser)
      .where(inArray(schema.appUser.id, [over, running, openEnded]));
    expect(Object.fromEntries(rows.map((row) => [row.id, row.status]))).toEqual({
      [over]: "active",
      [running]: "paused",
      [openEnded]: "paused",
    });
  });

  it("reminds members during the window and pauses them after the deadline", async () => {
    const [school] = await db.select({ id: schema.school.id }).from(schema.school).limit(1);
    const make = async (reverifyDueAt: Date) => {
      const id = uuidv7();
      await db.insert(schema.appUser).values({
        id,
        schoolId: school?.id ?? "",
        email: `reverify.${id}@epita.fr`,
        emailHmac: `reverify-${id}`,
        status: "active",
        reverifyDueAt,
      });
      return id;
    };
    const due = await make(new Date("2026-10-20T00:00:00Z"));
    const overdue = await make(new Date("2026-09-30T00:00:00Z"));
    const later = await make(new Date("2027-10-01T00:00:00Z"));
    const sent: string[] = [];
    await reverificationTask({
      database: () => db,
      storage: () => storage,
      now: () => now,
      sendEmail: async (to) => {
        sent.push(to);
      },
    })({}, helpers);
    expect(sent).toContain(`reverify.${due}@epita.fr`);
    expect(sent).not.toContain(`reverify.${later}@epita.fr`);
    const rows = await db
      .select({
        id: schema.appUser.id,
        status: schema.appUser.status,
        flag: schema.appUser.pausedForReverification,
      })
      .from(schema.appUser)
      .where(inArray(schema.appUser.id, [due, overdue, later]));
    expect(Object.fromEntries(rows.map((row) => [row.id, [row.status, row.flag]]))).toEqual({
      [due]: ["active", false],
      [overdue]: ["paused", true],
      [later]: ["active", false],
    });
  });
});
