import { createDatabase, schema } from "@epilove/db";
import { saveDeckFilter } from "@epilove/db/repositories/discovery";
import { dropRunOf, publishDrops } from "@epilove/db/repositories/discovery-drop";
import {
  answerQuestionnaire,
  cleanupTestMembers,
  createTestMember,
  prepareTestDatabase,
} from "@epilove/db/testing";
import { and, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { computeDrops } from "./compute";
import { dropTick } from "./tick";

const url = process.env.DATABASE_URL;
/** A past day nobody else computes (the scheduler only handles the current day). */
const DAY = "2026-01-15";

describe.skipIf(!url)("evening Drop", () => {
  const { db, close } = createDatabase(url ?? "", { maxConnections: 4 });
  beforeAll(() => prepareTestDatabase(db));
  afterAll(async () => {
    await db.delete(schema.drop).where(eq(schema.drop.day, DAY));
    await db.delete(schema.dropRun).where(eq(schema.dropRun.day, DAY));
    await cleanupTestMembers(db);
    await close();
  });

  it("proposes eligible profiles only, within the caps, then publishes once", async () => {
    // Members left by an interrupted earlier run (same school and year) would join the Drop.
    await db.execute(sql`
      delete from ${schema.appUser} where ${schema.appUser.email} like 'test-%' and ${schema.appUser.id} in (
        select ${schema.profile.userId} from ${schema.profile} where ${schema.profile.graduationYear} = 2040
      )`);
    const viewer = await createTestMember(db, {
      firstName: "Vera",
      gender: "woman",
      interestedIn: ["man"],
      schoolSlug: "ipsa",
      graduationYear: 2040,
    });
    const man = () =>
      createTestMember(db, {
        gender: "man",
        interestedIn: ["woman"],
        schoolSlug: "ipsa",
        graduationYear: 2040,
      });
    const candidates = [await man(), await man(), await man()];
    const blocked = await man();
    const passed = await man();
    for (const member of [viewer, ...candidates, blocked, passed]) {
      await answerQuestionnaire(db, member);
    }
    // Only this test's school and year: other members (development data, other tests) stay out.
    await saveDeckFilter(db, viewer, {
      mode: "all",
      schoolSlugs: ["ipsa"],
      graduationYears: [2040],
      intentions: [],
      ageMin: null,
      ageMax: null,
    });
    await db.insert(schema.block).values({ blockerId: viewer, blockedId: blocked });
    await db.insert(schema.likeAction).values({ actorId: viewer, targetId: passed, kind: "pass" });

    const now = new Date();
    const stats = await computeDrops(db, { day: DAY, now, force: true });
    expect(stats?.maxAppearances).toBeLessThanOrEqual(10);
    const [mine] = await db
      .select({ candidates: schema.drop.candidates })
      .from(schema.drop)
      .where(and(eq(schema.drop.userId, viewer), eq(schema.drop.day, DAY)));
    expect(new Set(mine?.candidates)).toEqual(new Set(candidates));

    // A second claim of the same day is refused while the first is fresh.
    expect(await computeDrops(db, { day: DAY, now })).toBeNull();

    expect(await publishDrops(db, DAY, now)).toBeGreaterThanOrEqual(4);
    expect(await publishDrops(db, DAY, now)).toBe(0);
    const notifications = await db
      .select({ type: schema.notification.type })
      .from(schema.notification)
      .where(and(eq(schema.notification.userId, viewer), eq(schema.notification.type, "drop_ready")));
    expect(notifications).toHaveLength(1);
    expect((await dropRunOf(db, DAY))?.publishedAt).not.toBeNull();
  });

  it("does nothing before 20:30, campus time", async () => {
    let logged = 0;
    await dropTick(db, new Date("2026-01-16T19:00:00Z"), () => logged++);
    // 20:00 in Paris in winter: too early, nothing claimed.
    expect(await dropRunOf(db, "2026-01-16")).toBeNull();
    expect(logged).toBe(0);
  });
});
