import { uuidv7 } from "@epilove/core";
import { createDatabase, schema } from "@epilove/db";
import { cleanupTestMembers, createTestMember, prepareTestDatabase } from "@epilove/db/testing";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestApi } from "../rencontre/testing";

const url = process.env.DATABASE_URL;

describe.skipIf(!url)("matches", () => {
  const { db, close } = createDatabase(url ?? "", { maxConnections: 4 });
  const { as } = createTestApi(db);

  beforeAll(async () => {
    await prepareTestDatabase(db);
  });
  afterAll(async () => {
    await cleanupTestMembers(db);
    await close();
  });

  async function matched() {
    const a = await createTestMember(db, { firstName: "Anaïs" });
    const b = await createTestMember(db, { firstName: "Bilal" });
    await as(a).discovery.decide({ targetId: b, kind: "like", content: null, comment: null });
    const { matchId } = await as(b).discovery.decide({
      targetId: a,
      kind: "like",
      content: null,
      comment: null,
    });
    return { a, b, matchId: matchId ?? "" };
  }

  it("lists the active matches of both members", async () => {
    const { a, b, matchId } = await matched();
    const forA = await as(a).matches.list({ locale: "fr" });
    expect(forA.matches.map((m) => m.matchId)).toContain(matchId);
    expect(forA.matches.find((m) => m.matchId === matchId)).toMatchObject({
      other: { userId: b, firstName: "Bilal" },
      lastMessage: null,
      unread: 0,
    });
  });

  it("counts the messages not read yet, until they are read", async () => {
    const { a, b, matchId } = await matched();
    await as(b).messaging.send({ id: uuidv7(), matchId, text: "Coucou", replyTo: null });
    const last = uuidv7();
    await as(b).messaging.send({ id: last, matchId, text: "Tu es là ?", replyTo: null });
    const unreadOf = async (member: string) =>
      (await as(member).matches.list({ locale: "fr" })).matches.find((m) => m.matchId === matchId)?.unread;
    expect(await unreadOf(a)).toBe(2);
    expect(await unreadOf(b)).toBe(0);
    await as(a).messaging.read({ matchId, messageId: last });
    expect(await unreadOf(a)).toBe(0);
  });

  it("hides a match once one member blocked the other", async () => {
    const { a, b, matchId } = await matched();
    await db.insert(schema.block).values({ blockerId: b, blockedId: a });
    const forA = await as(a).matches.list({ locale: "fr" });
    expect(forA.matches.map((m) => m.matchId)).not.toContain(matchId);
  });

  it("unmatches for both members, idempotently, and only for participants", async () => {
    const { a, b, matchId } = await matched();
    const outsider = await createTestMember(db);
    await expect(as(outsider).matches.unmatch({ matchId })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(as(a).matches.unmatch({ matchId })).resolves.toEqual({ ok: true });
    await expect(as(a).matches.unmatch({ matchId })).resolves.toEqual({ ok: true });
    expect((await as(b).matches.list({ locale: "fr" })).matches.map((m) => m.matchId)).not.toContain(matchId);
    const [row] = await db.select().from(schema.match).where(eq(schema.match.id, matchId));
    expect(row).toMatchObject({ status: "unmatched", unmatchedBy: a });
    // The pair stays apart: liking again does not recreate the match.
    await expect(
      as(b).discovery.decide({ targetId: a, kind: "like", content: null, comment: null }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
