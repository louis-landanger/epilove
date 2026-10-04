import { createDatabase, schema } from "@atomes/db";
import { cleanupTestMembers, createTestMember, prepareTestDatabase } from "@atomes/db/testing";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestApi } from "../rencontre/testing";

const url = process.env.DATABASE_URL;

describe.skipIf(!url)("Dispo status (IRL-05)", () => {
  const { db, close } = createDatabase(url ?? "", { maxConnections: 4 });
  const { as } = createTestApi(db);
  beforeAll(() => prepareTestDatabase(db));
  afterAll(async () => {
    await cleanupTestMembers(db);
    await close();
  });

  const inHours = (hours: number) => new Date(Date.now() + hours * 3_600_000).toISOString();

  it("shows the status to matches only, until it expires or the member pauses", async () => {
    const sam = await createTestMember(db, { firstName: "Sam", graduationYear: 2038 });
    const match = await createTestMember(db, { graduationYear: 2038 });
    const stranger = await createTestMember(db, { graduationYear: 2038 });
    const [userLow, userHigh] = [sam, match].sort() as [string, string];
    const [created] = await db
      .insert(schema.match)
      .values({ userLow, userHigh, mode: "friends", source: "like" })
      .returning({ id: schema.match.id });

    await expect(
      as(sam).matches.setAvailability({
        availability: { activity: "coffee", area: "campus", until: inHours(13) },
      }),
    ).rejects.toMatchObject({ message: "too_long" });
    const set = await as(sam).matches.setAvailability({
      availability: { activity: "coffee", area: "campus", until: inHours(2) },
    });
    expect(set.availability).toMatchObject({ activity: "coffee", area: "campus" });
    expect((await as(sam).matches.availability()).availability?.activity).toBe("coffee");

    const listed = (await as(match).matches.list({ locale: "fr" })).matches.find(
      (m) => m.other.userId === sam,
    );
    expect(listed?.other.available).toMatchObject({ activity: "coffee", area: "campus" });
    const thread = await as(match).messaging.thread({ matchId: created?.id ?? "", locale: "fr" });
    expect(thread.otherAvailable?.activity).toBe("coffee");
    // Not a match: nothing to see (and no way to ask).
    expect((await as(stranger).matches.list({ locale: "fr" })).matches).toEqual([]);

    await db.update(schema.appUser).set({ status: "paused" }).where(eq(schema.appUser.id, sam));
    const paused = (await as(match).matches.list({ locale: "fr" })).matches.find(
      (m) => m.other.userId === sam,
    );
    expect(paused?.other.available).toBeNull();
    await db.update(schema.appUser).set({ status: "active" }).where(eq(schema.appUser.id, sam));

    await as(sam).matches.setAvailability({ availability: null });
    const cleared = (await as(match).matches.list({ locale: "fr" })).matches.find(
      (m) => m.other.userId === sam,
    );
    expect(cleared?.other.available).toBeNull();
  });
});
