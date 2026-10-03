import { randomUUID } from "node:crypto";
import { uuidv7 } from "@epilove/core";
import { createDatabase, schema } from "@epilove/db";
import { deleteSeason, enrolMembers, upsertSeason } from "@epilove/db/repositories/pact";
import {
  answerQuestionnaire,
  cleanupTestMembers,
  createTestMember,
  prepareTestDatabase,
} from "@epilove/db/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestApi } from "../rencontre/testing";

const url = process.env.DATABASE_URL;

describe.skipIf(!url)("campus community (COM-01, COM-02, PAC-04)", () => {
  const { db, close } = createDatabase(url ?? "", { maxConnections: 4 });
  const { as } = createTestApi(db);
  const seasons: string[] = [];
  beforeAll(() => prepareTestDatabase(db));
  afterAll(async () => {
    for (const id of seasons) {
      await deleteSeason(db, id);
    }
    await cleanupTestMembers(db);
    await close();
  });

  const members = (count: number, schoolSlug: string) =>
    Promise.all(
      Array.from({ length: count }, () => createTestMember(db, { schoolSlug, graduationYear: 2037 })),
    );

  it("shows the question of the week, then results from ten answers per school", async () => {
    const viewer = await createTestMember(db, { schoolSlug: "esme", graduationYear: 2037 });
    const before = await as(viewer).community.weekly({ locale: "fr" });
    expect(before.question?.options.length).toBeGreaterThan(1);
    expect(before.myAnswer).toBeNull();
    expect(before.results).toBeNull();
    expect(Date.parse(before.endsAt)).toBeGreaterThan(Date.now());
    const question = before.question;
    if (!question) {
      throw new Error("No question of the week.");
    }
    const [first, second] = question.options;

    await expect(
      as(viewer).community.answerWeekly({ questionId: question.id, option: "nope", locale: "fr" }),
    ).rejects.toMatchObject({ message: "invalid_option" });
    await expect(
      as(viewer).community.answerWeekly({
        questionId: randomUUID(),
        option: first?.value ?? "",
        locale: "fr",
      }),
    ).rejects.toMatchObject({ message: "closed" });

    const answered = await as(viewer).community.answerWeekly({
      questionId: question.id,
      option: first?.value ?? "",
      locale: "fr",
    });
    expect(answered.myAnswer).toBe(first?.value);
    expect(answered.results).not.toBeNull();
    // Changing one's mind replaces the answer.
    const changed = await as(viewer).community.answerWeekly({
      questionId: question.id,
      option: second?.value ?? "",
      locale: "fr",
    });
    expect(changed.myAnswer).toBe(second?.value);

    const ipsaBefore = changed.results?.bySchool.find((s) => s.schoolSlug === "ipsa")?.total ?? 0;
    for (const member of await members(10, "ipsa")) {
      await as(member).community.answerWeekly({
        questionId: question.id,
        option: first?.value ?? "",
        locale: "fr",
      });
    }
    const after = await as(viewer).community.weekly({ locale: "fr" });
    const ipsa = after.results?.bySchool.find((s) => s.schoolSlug === "ipsa");
    expect(ipsa?.total).toBe(ipsaBefore + 10);
    for (const school of after.results?.bySchool ?? []) {
      expect(school.total).toBeGreaterThanOrEqual(10);
    }
    const shown = (after.results?.bySchool ?? []).reduce((sum, s) => sum + s.total, 0);
    if (after.results?.overall) {
      const hidden = after.results.overall.total - shown;
      expect(hidden === 0 || hidden >= 10).toBe(true);
    }
  });

  it("indexes cross-school pairs of ten new matches or more", async () => {
    const isg = await members(10, "isg");
    const supbiotech = await members(10, "supbiotech");
    const viewer = isg[0] ?? "";
    const before = (await as(viewer).community.crossSchool()).pairs.find(
      (p) => p.a === "isg" && p.b === "supbiotech",
    );
    for (let i = 0; i < 10; i++) {
      const [userLow, userHigh] = [isg[i] ?? "", supbiotech[i] ?? ""].sort() as [string, string];
      await db.insert(schema.match).values({ userLow, userHigh, mode: "friends", source: "like" });
    }
    const index = await as(viewer).community.crossSchool();
    const pair = index.pairs.find((p) => p.a === "isg" && p.b === "supbiotech");
    // A pair below ten was hidden before: only a lower bound is known then.
    if (before) {
      expect(pair?.count).toBe(before.count + 10);
    } else {
      expect(pair?.count).toBeGreaterThanOrEqual(10);
    }
    for (const p of index.pairs) {
      expect(p.a).not.toBe(p.b);
      expect(p.count).toBeGreaterThanOrEqual(10);
    }
  });

  it("publishes the Pact's statistics after the reveal, only above ten people", async () => {
    const participants = await members(12, "epita");
    for (const member of participants) {
      await answerQuestionnaire(db, member);
    }
    const now = Date.now();
    const seasonId = await upsertSeason(db, {
      slug: `test-stats-${randomUUID()}`,
      name: "Pacte de test",
      opensAt: new Date(now - 30 * 86_400_000),
      closesAt: new Date(now - 20 * 86_400_000),
      // The latest revealed season, whatever the development data holds.
      revealAt: new Date(now + 400 * 86_400_000),
      status: "revealed",
    });
    seasons.push(seasonId);
    await enrolMembers(
      db,
      seasonId,
      participants.map((userId) => ({ userId, modes: ["friends"] as const })),
      new Date(),
    );
    for (let i = 0; i < 12; i += 2) {
      const [userLow, userHigh] = [participants[i] ?? "", participants[i + 1] ?? ""].sort() as [
        string,
        string,
      ];
      await db.insert(schema.pactResult).values({ seasonId, mode: "friends", userLow, userHigh, score: 0.9 });
    }

    const stats = await as(participants[0] ?? "").community.pactStats({ locale: "fr" });
    expect(stats).toMatchObject({ season: { name: "Pacte de test" }, participants: 12, matches: 6 });
    // Six matches only: the cross-school share would be too precise.
    expect(stats.crossSchoolPercent).toBeNull();
    expect(stats.facts.length).toBeGreaterThan(0);
    expect(stats.facts.length).toBeLessThanOrEqual(5);
    // Everybody gave the same answers in this test.
    expect(stats.facts.every((f) => f.percent === 100)).toBe(true);
  });

  it("sums up the member's own year (COM-03)", async () => {
    const a = await createTestMember(db, { graduationYear: 2037 });
    const b = await createTestMember(db, { graduationYear: 2037 });
    await as(a).discovery.decide({ targetId: b, kind: "like", content: null, comment: null });
    const { matchId } = await as(b).discovery.decide({
      targetId: a,
      kind: "like",
      content: null,
      comment: null,
    });
    const id = () => uuidv7(Date.now(), crypto.getRandomValues(new Uint8Array(10)));
    for (const text of ["Salut", "Ça va ?", "On se voit jeudi ?"]) {
      await as(a).messaging.send({ id: id(), matchId: matchId ?? "", text, replyTo: null });
    }
    const { message } = await as(b).messaging.send({
      id: id(),
      matchId: matchId ?? "",
      text: "Oui !",
      replyTo: null,
    });
    await as(a).messaging.react({ matchId: matchId ?? "", messageId: message.id, emoji: "🔥" });

    const wrapped = await as(a).community.wrapped();
    expect(wrapped).toMatchObject({
      matches: 1,
      messages: 3,
      conversations: 1,
      likes: 1,
      favoriteReaction: "🔥",
      peakHour: Number(
        new Intl.DateTimeFormat("en-GB", {
          timeZone: "Europe/Paris",
          hour: "2-digit",
          hourCycle: "h23",
        }).format(new Date()),
      ),
    });
    expect(wrapped.label).toMatch(/^\d{4}–\d{4}$/);
  });
});
