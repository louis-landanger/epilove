import { randomUUID } from "node:crypto";
import { createDatabase, schema } from "@epilove/db";
import { upsertSeason } from "@epilove/db/repositories/pact";
import {
  answerQuestionnaire,
  cleanupTestMembers,
  createTestMember,
  prepareTestDatabase,
} from "@epilove/db/testing";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestApi } from "../rencontre/testing";

const url = process.env.DATABASE_URL;

describe.skipIf(!url)("pact", () => {
  const { db, close } = createDatabase(url ?? "", { maxConnections: 4 });
  const { as } = createTestApi(db);
  let seasonId = "";

  beforeAll(async () => {
    await prepareTestDatabase(db);
    // Far in the future, so this season is the current one while the tests run.
    seasonId = await upsertSeason(db, {
      slug: `test-${randomUUID()}`,
      name: "Pacte de test",
      opensAt: new Date(Date.now() - 86_400_000),
      closesAt: new Date("2099-02-01T20:00:00Z"),
      revealAt: new Date("2099-02-14T19:00:00Z"),
      status: "open",
    });
  });
  afterAll(async () => {
    await db.delete(schema.pactSeason).where(eq(schema.pactSeason.id, seasonId));
    await cleanupTestMembers(db);
    await close();
  });

  it("shows the open season, the server clock and the questionnaire requirement", async () => {
    const member = await createTestMember(db);
    const current = await as(member).pact.current();
    expect(current.season).toMatchObject({
      id: seasonId,
      phase: "open",
      revealAt: "2099-02-14T19:00:00.000Z",
    });
    expect(current.participation).toBeNull();
    expect(current.questionnaire).toEqual({ answered: 0, required: 30 });
    expect(current.availableModes).toEqual(["love", "friends"]);
    expect(Math.abs(Date.parse(current.serverNow) - Date.now())).toBeLessThan(10_000);
    // A small season: the clients spread their result requests over the animation only.
    expect(current.revealWindowMs).toBe(3000);
  });

  it("asks for the questionnaire before joining", async () => {
    const member = await createTestMember(db);
    await expect(as(member).pact.join({ modes: ["love"] })).rejects.toMatchObject({
      message: "questionnaire_incomplete",
    });
  });

  it("joins with the member's own modes, changes them and leaves while open", async () => {
    const member = await createTestMember(db, { modes: ["friends"] });
    await answerQuestionnaire(db, member);
    await expect(as(member).pact.join({ modes: ["love"] })).rejects.toMatchObject({
      message: "mode_unavailable",
    });
    expect(await as(member).pact.join({ modes: ["friends"] })).toEqual({ modes: ["friends"] });
    // Idempotent.
    expect(await as(member).pact.join({ modes: ["friends"] })).toEqual({ modes: ["friends"] });
    const current = await as(member).pact.current();
    expect(current.participation).toEqual({ modes: ["friends"] });
    expect(current.participants).toBeGreaterThanOrEqual(1);
    expect(await as(member).pact.leave()).toEqual({ left: true });
    expect((await as(member).pact.current()).participation).toBeNull();
  });

  it("keeps results private until the reveal, then shows the match and its radar", async () => {
    const a = await createTestMember(db, { firstName: "Aurore" });
    const b = await createTestMember(db, { firstName: "Bastien" });
    for (const member of [a, b]) {
      await answerQuestionnaire(db, member);
      await as(member).pact.join({ modes: ["love", "friends"] });
    }
    const [low, high] = a < b ? [a, b] : [b, a];
    const [result] = await db
      .insert(schema.pactResult)
      .values({
        seasonId,
        mode: "love",
        userLow: low,
        userHigh: high,
        score: 0.91,
        explanation: { sections: [{ section: "values", score: 0.95 }] },
      })
      .returning({ id: schema.pactResult.id });

    await expect(as(a).pact.result({ locale: "fr" })).rejects.toMatchObject({ message: "not_revealed" });

    // What the reveal does (tested in apps/worker): a match, the link, the status.
    const [created] = await db
      .insert(schema.match)
      .values({ userLow: low, userHigh: high, mode: "love", source: "pact" })
      .returning({ id: schema.match.id });
    await db
      .update(schema.pactResult)
      .set({ matchId: created?.id })
      .where(eq(schema.pactResult.id, result?.id ?? ""));
    await db.update(schema.pactSeason).set({ status: "revealed" }).where(eq(schema.pactSeason.id, seasonId));

    const forA = await as(a).pact.result({ locale: "fr" });
    expect(forA.matches).toHaveLength(1);
    expect(forA.matches[0]).toMatchObject({
      mode: "love",
      score: expect.closeTo(0.91, 5),
      card: { userId: b, firstName: "Bastien" },
      sections: [{ section: "values", score: 0.95 }],
      matchId: created?.id,
    });
    expect(forA.matches[0]?.compatibility.agreements.length).toBeGreaterThan(0);

    // Someone who did not take part sees nothing, even after the reveal.
    const outsider = await createTestMember(db);
    await expect(as(outsider).pact.result({ locale: "fr" })).rejects.toMatchObject({
      message: "not_revealed",
    });

    // A block after the reveal hides the result again.
    await db.insert(schema.block).values({ blockerId: b, blockedId: a });
    expect((await as(a).pact.result({ locale: "fr" })).matches).toEqual([]);

    // No more joining once revealed.
    const late = await createTestMember(db);
    await answerQuestionnaire(db, late);
    await expect(as(late).pact.join({ modes: ["love"] })).rejects.toMatchObject({ message: "pact_closed" });
  });

  it("reports no live count without Centrifugo", async () => {
    const member = await createTestMember(db);
    const previous = process.env.CENTRIFUGO_URL;
    delete process.env.CENTRIFUGO_URL;
    try {
      expect(await as(member).pact.liveCount()).toEqual({ count: null });
    } finally {
      if (previous !== undefined) {
        process.env.CENTRIFUGO_URL = previous;
      }
    }
  });
});
