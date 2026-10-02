import { uuidv7 } from "@epilove/core";
import { createDatabase, schema } from "@epilove/db";
import { cleanupTestMembers, createTestMember, prepareTestDatabase } from "@epilove/db/testing";
import { createMemoryPublisher } from "@epilove/realtime";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { setRealtimePublisher } from "../rencontre/realtime";
import { createTestApi } from "../rencontre/testing";

const url = process.env.DATABASE_URL;
const newId = () => uuidv7(Date.now(), crypto.getRandomValues(new Uint8Array(10)));

describe.skipIf(!url)("messaging", () => {
  const { db, close } = createDatabase(url ?? "", { maxConnections: 4 });
  const { as } = createTestApi(db);
  const { publisher, published } = createMemoryPublisher();

  beforeAll(async () => {
    await prepareTestDatabase(db);
    setRealtimePublisher(publisher);
  });
  afterAll(async () => {
    setRealtimePublisher(undefined);
    await cleanupTestMembers(db);
    await close();
  });

  async function conversation() {
    const a = await createTestMember(db, { firstName: "Alix" });
    const b = await createTestMember(db, { firstName: "Bao" });
    await as(a).discovery.decide({ targetId: b, kind: "like", content: null, comment: null });
    const { matchId } = await as(b).discovery.decide({
      targetId: a,
      kind: "like",
      content: null,
      comment: null,
    });
    return { a, b, matchId: matchId ?? "" };
  }

  it("sends a message idempotently and stores it encrypted", async () => {
    const { a, b, matchId } = await conversation();
    const id = newId();
    const first = await as(a).messaging.send({
      id,
      matchId,
      text: "  Salut ! On se voit au campus ?  ",
      replyTo: null,
    });
    expect(first.message).toMatchObject({ id, senderId: a, text: "Salut ! On se voit au campus ?" });
    const retry = await as(a).messaging.send({
      id,
      matchId,
      text: "Salut ! On se voit au campus ?",
      replyTo: null,
    });
    expect(retry.message.id).toBe(id);
    const rows = await db.select().from(schema.message).where(eq(schema.message.matchId, matchId));
    expect(rows).toHaveLength(1);
    expect(Buffer.from(rows[0]?.bodyEncrypted ?? []).toString("utf8")).not.toContain("campus");

    const thread = await as(b).messaging.thread({ matchId, locale: "fr" });
    expect(thread.messages.map((m) => m.text)).toEqual(["Salut ! On se voit au campus ?"]);
    expect(thread.other.firstName).toBe("Alix");
    expect(thread.icebreakers).toHaveLength(3);
    // The same id cannot be reused by the other member.
    await expect(as(b).messaging.send({ id, matchId, text: "hack", replyTo: null })).rejects.toMatchObject({
      code: "CONFLICT",
    });
  });

  it("refuses outsiders, closed matches and blocked members", async () => {
    const { a, b, matchId } = await conversation();
    const outsider = await createTestMember(db);
    await expect(as(outsider).messaging.thread({ matchId, locale: "fr" })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await db.insert(schema.block).values({ blockerId: b, blockedId: a });
    await expect(
      as(a).messaging.send({ id: newId(), matchId, text: "Coucou", replyTo: null }),
    ).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(as(b).messaging.thread({ matchId, locale: "fr" })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("pages history and catches up after a disconnection", async () => {
    const { a, b, matchId } = await conversation();
    const ids: string[] = [];
    for (let i = 0; i < 5; i++) {
      const id = newId();
      ids.push(id);
      await as(i % 2 ? b : a).messaging.send({ id, matchId, text: `message ${i}`, replyTo: null });
    }
    const older = await as(a).messaging.history({ matchId, before: ids[3], limit: 2 });
    expect(older.messages.map((m) => m.text)).toEqual(["message 1", "message 2"]);
    expect(older.hasMore).toBe(true);
    const missed = await as(a).messaging.history({ matchId, after: ids[2], limit: 40 });
    expect(missed.messages.map((m) => m.text)).toEqual(["message 3", "message 4"]);
  });

  it("supports replies, reactions and reciprocal read receipts", async () => {
    const { a, b, matchId } = await conversation();
    const question = newId();
    await as(a).messaging.send({ id: question, matchId, text: "Escalade samedi ?", replyTo: null });
    const answer = newId();
    const { message } = await as(b).messaging.send({
      id: answer,
      matchId,
      text: "Carrément !",
      replyTo: question,
    });
    expect(message.replyTo).toMatchObject({ id: question, text: "Escalade samedi ?" });

    await as(a).messaging.react({ matchId, messageId: answer, emoji: "🔥" });
    await expect(as(a).messaging.react({ matchId, messageId: answer, emoji: "💩" })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    await as(a).messaging.read({ matchId, messageId: answer });
    const forB = await as(b).messaging.thread({ matchId, locale: "fr" });
    expect(forB.otherLastReadId).toBe(answer);
    expect(forB.messages.find((m) => m.id === answer)?.reactions).toEqual([{ userId: a, emoji: "🔥" }]);

    // Turning read receipts off hides them both ways.
    await as(b).messaging.saveSettings({ readReceipts: false, onlineStatus: true });
    expect((await as(b).messaging.thread({ matchId, locale: "fr" })).otherLastReadId).toBeNull();
    expect((await as(a).messaging.thread({ matchId, locale: "fr" })).otherLastReadId).toBeNull();
  });

  it("edits and deletes one's own messages within ten minutes (CHAT-08)", async () => {
    const { a, b, matchId } = await conversation();
    const id = newId();
    await as(a).messaging.send({ id, matchId, text: "Rdv à 18 h", replyTo: null });
    await as(b).messaging.react({ matchId, messageId: id, emoji: "👍" });

    const edited = await as(a).messaging.edit({ matchId, messageId: id, text: "Rdv à 19 h" });
    expect(edited.message).toMatchObject({ text: "Rdv à 19 h", editedAt: expect.any(String) });
    await expect(as(b).messaging.edit({ matchId, messageId: id, text: "non" })).rejects.toMatchObject({
      message: "not_sender",
    });

    const removed = await as(a).messaging.remove({ matchId, messageId: id });
    expect(removed.message).toMatchObject({ deleted: true, text: "", reactions: [] });
    const history = await as(b).messaging.history({ matchId, limit: 10 });
    expect(history.messages.find((m) => m.id === id)).toMatchObject({ deleted: true, text: "" });
    // Kept encrypted for moderation, unreadable by both members.
    const [row] = await db.select().from(schema.message).where(eq(schema.message.id, id));
    expect(row?.bodyEncrypted).not.toBeNull();

    const old = newId();
    await as(a).messaging.send({ id: old, matchId, text: "Ancien message", replyTo: null });
    await db
      .update(schema.message)
      .set({ createdAt: sql`now() - interval '11 minutes'` })
      .where(eq(schema.message.id, old));
    await expect(as(a).messaging.remove({ matchId, messageId: old })).rejects.toMatchObject({
      message: "too_late",
    });
    await expect(as(a).messaging.edit({ matchId, messageId: old, text: "Réécrit" })).rejects.toMatchObject({
      message: "too_late",
    });
  });

  it("flags potentially offensive messages for the recipient (SAF-10)", async () => {
    const { a, b, matchId } = await conversation();
    const id = newId();
    const sent = await as(a).messaging.send({ id, matchId, text: "t'es vraiment un connard", replyTo: null });
    expect(sent.flags).toContain("insult");
    const history = await as(b).messaging.history({ matchId, limit: 10 });
    expect(history.messages.find((m) => m.id === id)?.flagged).toBe(true);
    const calm = newId();
    await as(a).messaging.send({ id: calm, matchId, text: "Pardon, je me suis emporté", replyTo: null });
    expect(
      (await as(b).messaging.history({ matchId, limit: 10 })).messages.find((m) => m.id === calm)?.flagged,
    ).toBe(false);
  });

  it("relays typing to the other member only", async () => {
    const { a, b, matchId } = await conversation();
    await as(a).messaging.typing({ matchId });
    expect(published.at(-1)).toEqual({ channel: `personal:#${b}`, event: { type: "typing", matchId } });
  });

  it("limits sending to 20 messages per minute and refuses stale ids", async () => {
    const { a, matchId } = await conversation();
    await db.execute(sql`select 1`);
    for (let i = 0; i < 20; i++) {
      await as(a).messaging.send({ id: newId(), matchId, text: `spam ${i}`, replyTo: null });
    }
    await expect(
      as(a).messaging.send({ id: newId(), matchId, text: "encore", replyTo: null }),
    ).rejects.toMatchObject({
      code: "TOO_MANY_REQUESTS",
    });
    const stale = uuidv7(Date.now() - 3_600_000, new Uint8Array(10));
    const { matchId: other, a: sender } = await conversation();
    await expect(
      as(sender).messaging.send({ id: stale, matchId: other, text: "vieux", replyTo: null }),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
  });

  it("issues a realtime token for the member's personal channel", async () => {
    process.env.CENTRIFUGO_TOKEN_SECRET ??= "test-only-centrifugo-secret";
    const member = await createTestMember(db);
    const token = await as(member).realtime.token();
    expect(token.channel).toBe(`personal:#${member}`);
    await expect(as(null).realtime.token()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});
