import { createDatabase, schema } from "@epilove/db";
import { cleanupTestMembers, createTestMember, prepareTestDatabase } from "@epilove/db/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestApi } from "../rencontre/testing";

const url = process.env.DATABASE_URL;

describe.skipIf(!url)("questionnaire", () => {
  const { db, close } = createDatabase(url ?? "", { maxConnections: 4 });
  const { as } = createTestApi(db);
  let alice = "";
  let bob = "";
  let blocked = "";

  beforeAll(async () => {
    await prepareTestDatabase(db);
    alice = await createTestMember(db, { firstName: "Alice", gender: "woman", interestedIn: ["man"] });
    bob = await createTestMember(db, {
      firstName: "Bob",
      gender: "man",
      interestedIn: ["woman"],
      schoolSlug: "isg",
    });
    blocked = await createTestMember(db, { firstName: "Carl", gender: "man", schoolSlug: "esme" });
    await db.insert(schema.block).values({ blockerId: blocked, blockedId: alice });
  });
  afterAll(async () => {
    await cleanupTestMembers(db);
    await close();
  });

  it("lists the questions in the requested language", async () => {
    const fr = await as(alice).questionnaire.get({ locale: "fr" });
    const en = await as(alice).questionnaire.get({ locale: "en" });
    expect(fr.questions.length).toBe(45);
    expect(fr.questions[0]?.text).not.toBe(en.questions[0]?.text);
    expect(fr.answers).toEqual([]);
  });

  it("saves answers idempotently and rejects unknown options", async () => {
    const { questions } = await as(alice).questionnaire.get({ locale: "fr" });
    const first = questions[0];
    if (!first) {
      throw new Error("no question");
    }
    const value = first.options[0]?.value ?? "";
    const input = { questionId: first.id, answer: value, acceptable: [value], importance: "very" as const };
    await expect(as(alice).questionnaire.answer(input)).resolves.toEqual({ answered: 1, total: 45 });
    await expect(as(alice).questionnaire.answer(input)).resolves.toEqual({ answered: 1, total: 45 });
    await expect(as(alice).questionnaire.answer({ ...input, answer: "nope" })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    await expect(as(null).questionnaire.answer(input)).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("explains compatibility with a visible member", async () => {
    const { questions } = await as(alice).questionnaire.get({ locale: "fr" });
    for (const q of questions.slice(0, 15)) {
      const value = q.options[0]?.value ?? "";
      for (const member of [alice, bob]) {
        await as(member).questionnaire.answer({
          questionId: q.id,
          answer: value,
          acceptable: [value],
          importance: "somewhat",
        });
      }
    }
    const view = await as(alice).questionnaire.compatibility({ userId: bob, locale: "fr" });
    expect(view.commonQuestions).toBe(15);
    expect(view.score).toBeCloseTo(1 - 1 / 15, 5);
    expect(view.agreements).toHaveLength(2);
    expect(view.quirk).toBeNull();
  });

  it("refuses to reveal anything about a member who blocked the viewer", async () => {
    await expect(
      as(alice).questionnaire.compatibility({ userId: blocked, locale: "fr" }),
    ).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});
