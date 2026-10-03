import type { MessageAttachment } from "@epilove/contracts";
import { uuidv7 } from "@epilove/core";
import { createDatabase, schema } from "@epilove/db";
import { createMemoryObjectStore } from "@epilove/db/storage";
import { cleanupTestMembers, createTestMember, prepareTestDatabase } from "@epilove/db/testing";
import { createMemoryPublisher } from "@epilove/realtime";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { setGiphyFetch } from "../rencontre/giphy";
import { setChatMediaStore } from "../rencontre/media";
import { setImageClassifier } from "../rencontre/media-files";
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

  it("sends house stickers, and shows them in the conversation list (CHAT-05)", async () => {
    const { a, b, matchId } = await conversation();
    const id = newId();
    const sent = await as(a).messaging.sendSticker({ id, matchId, sticker: "bond", replyTo: null });
    expect(sent.message).toMatchObject({
      kind: "sticker",
      text: "",
      attachment: { type: "sticker", sticker: "bond" },
    });
    await expect(
      as(a).messaging.sendSticker({ id: newId(), matchId, sticker: "not-a-sticker", replyTo: null }),
    ).rejects.toMatchObject({ message: "unknown_sticker" });
    const list = await as(b).matches.list({ locale: "fr" });
    expect(list.matches.find((m) => m.matchId === matchId)?.lastMessage).toMatchObject({
      kind: "sticker",
      preview: "",
      fromMe: false,
    });
  });

  it("keeps GIFs off without a GIPHY key, and only shows GIPHY media with one (CHAT-05)", async () => {
    const { a, matchId } = await conversation();
    const previous = process.env.GIPHY_API_KEY;
    delete process.env.GIPHY_API_KEY;
    try {
      expect(await as(a).messaging.gifs({ query: "chat" })).toEqual({ enabled: false, gifs: [] });
      process.env.GIPHY_API_KEY = "test-key";
      const asked: string[] = [];
      setGiphyFetch(async (input) => {
        const url = String(input);
        asked.push(url);
        const item = (id: string, host: string) => ({
          id,
          title: `GIF ${id}`,
          images: {
            fixed_width: { url: `https://${host}/media/${id}/200w.gif`, width: "200", height: "150" },
          },
        });
        const body = url.includes("/search")
          ? { data: [item("abc", "media1.giphy.com"), item("evil", "tracker.example")] }
          : { data: item("abc", "media1.giphy.com") };
        return new Response(JSON.stringify(body), { headers: { "content-type": "application/json" } });
      });
      const result = await as(a).messaging.gifs({ query: "chat" });
      expect(result.gifs.map((g) => g.id)).toEqual(["abc"]);
      expect(asked[0]).not.toContain(a);
      const sent = await as(a).messaging.sendGif({ id: newId(), matchId, gifId: "abc", replyTo: null });
      expect(sent.message.attachment).toMatchObject({
        type: "gif",
        url: "https://media1.giphy.com/media/abc/200w.gif",
      });
    } finally {
      setGiphyFetch(undefined);
      if (previous === undefined) {
        delete process.env.GIPHY_API_KEY;
      } else {
        process.env.GIPHY_API_KEY = previous;
      }
    }
  });

  it("proposes a date at a Spot, then accepts it (CHAT-10)", async () => {
    const { a, b, matchId } = await conversation();
    const { spots } = await as(a).campusLife.spots({ locale: "fr" });
    const spot = spots[0];
    const startsAt = new Date(Date.now() + 2 * 86_400_000).toISOString();
    const id = newId();
    const proposed = await as(a).messaging.proposeDate({
      id,
      matchId,
      spotId: spot?.id ?? null,
      place: null,
      startsAt,
      note: "Un café après les cours ?",
      counterTo: null,
    });
    expect(proposed.message.attachment).toMatchObject({
      type: "date",
      spot: { id: spot?.id, name: spot?.name },
      startsAt,
      note: "Un café après les cours ?",
      status: "proposed",
    });
    await expect(
      as(a).messaging.respondDate({ matchId, messageId: id, response: "accept" }),
    ).rejects.toMatchObject({
      message: "own_proposal",
    });
    const accepted = await as(b).messaging.respondDate({ matchId, messageId: id, response: "accept" });
    expect(accepted.message.attachment).toMatchObject({ type: "date", status: "accepted" });
    await expect(
      as(b).messaging.respondDate({ matchId, messageId: id, response: "decline" }),
    ).rejects.toMatchObject({
      message: "already_answered",
    });
    const list = await as(b).matches.list({ locale: "fr" });
    expect(list.matches.find((m) => m.matchId === matchId)?.lastMessage?.kind).toBe("date_proposal");
  });

  it("answers a proposal with another one, and refuses dates too soon or without a place", async () => {
    const { a, b, matchId } = await conversation();
    const first = newId();
    const inThreeDays = new Date(Date.now() + 3 * 86_400_000).toISOString();
    await as(a).messaging.proposeDate({
      id: first,
      matchId,
      spotId: null,
      place: "Devant la BU",
      startsAt: inThreeDays,
      note: "",
      counterTo: null,
    });
    const counter = await as(b).messaging.proposeDate({
      id: newId(),
      matchId,
      spotId: null,
      place: "Place Valmy",
      startsAt: new Date(Date.now() + 4 * 86_400_000).toISOString(),
      note: "Plutôt jeudi ?",
      counterTo: first,
    });
    expect(counter.message.replyTo?.id).toBe(first);
    const history = await as(a).messaging.history({ matchId, limit: 10 });
    expect(history.messages.find((m) => m.id === first)?.attachment).toMatchObject({ status: "countered" });
    await expect(
      as(a).messaging.proposeDate({
        id: newId(),
        matchId,
        spotId: null,
        place: "Ici",
        startsAt: new Date(Date.now() + 10 * 60_000).toISOString(),
        note: "",
        counterTo: null,
      }),
    ).rejects.toMatchObject({ message: "too_soon" });
    await expect(
      as(a).messaging.proposeDate({
        id: newId(),
        matchId,
        spotId: null,
        place: " ",
        startsAt: inThreeDays,
        note: "",
        counterTo: null,
      }),
    ).rejects.toMatchObject({ message: "no_place" });
  });

  it("sends a photo without its metadata, and a view-once photo opened once (CHAT-06)", async () => {
    const { a, b, matchId } = await conversation();
    const { store, objects } = createMemoryObjectStore();
    setChatMediaStore(store);
    try {
      const exif = [...new TextEncoder().encode("Exif\0\0GPS 45.76N")];
      const jpeg = new Uint8Array([
        0xff,
        0xd8,
        0xff,
        0xe1,
        0,
        exif.length + 2,
        ...exif,
        0xff,
        0xda,
        0,
        4,
        1,
        2,
        9,
        9,
        0xff,
        0xd9,
      ]);
      const id = newId();
      const sent = await as(a).messaging.sendImage({
        id,
        matchId,
        file: new File([jpeg], "photo.jpg", { type: "image/jpeg" }),
        width: 800,
        height: 600,
        viewOnce: false,
        replyTo: null,
      });
      expect(sent.message.attachment).toMatchObject({
        type: "image",
        width: 800,
        viewOnce: false,
        explicit: false,
      });
      expect(sent.message.attachment?.type === "image" && sent.message.attachment.url).toBeTruthy();
      const stored = objects.get(`chat/${matchId}/${id}.jpg`);
      expect(new TextDecoder().decode(stored?.body)).not.toContain("GPS");

      // A retry with the same id returns the stored message and never replaces its photo
      // (otherwise a second upload would skip the classifier's verdict).
      const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
      const retried = await as(a).messaging.sendImage({
        id,
        matchId,
        file: new File([png], "other.png", { type: "image/png" }),
        width: 10,
        height: 10,
        viewOnce: true,
        replyTo: null,
      });
      expect(retried.message.attachment).toMatchObject({ width: 800, viewOnce: false });
      expect(objects.has(`chat/${matchId}/${id}.png`)).toBe(false);
      expect(objects.get(`chat/${matchId}/${id}.jpg`)?.body).toEqual(stored?.body);

      await expect(
        as(a).messaging.sendImage({
          id: newId(),
          matchId,
          file: new File(["<svg onload=alert(1)>"], "x.jpg", { type: "image/jpeg" }),
          width: 1,
          height: 1,
          viewOnce: false,
          replyTo: null,
        }),
      ).rejects.toMatchObject({ message: "unsupported_media" });

      const once = newId();
      const viewOnce = await as(a).messaging.sendImage({
        id: once,
        matchId,
        file: new File([jpeg], "photo.jpg", { type: "image/jpeg" }),
        width: 800,
        height: 600,
        viewOnce: true,
        replyTo: null,
      });
      expect(viewOnce.message.attachment).toMatchObject({
        type: "image",
        url: null,
        viewOnce: true,
        viewed: false,
      });
      await expect(as(a).messaging.viewMedia({ matchId, messageId: once })).rejects.toMatchObject({
        message: "own_media",
      });
      const opened = await as(b).messaging.viewMedia({ matchId, messageId: once });
      expect(opened.url).toBeTruthy();
      await expect(as(b).messaging.viewMedia({ matchId, messageId: once })).rejects.toMatchObject({
        message: "already_viewed",
      });
      const history = await as(b).messaging.history({ matchId, limit: 10 });
      expect(history.messages.find((m) => m.id === once)?.attachment).toMatchObject({
        viewed: true,
        url: null,
      });
      const queued = await db
        .select()
        .from(schema.mediaDeletion)
        .where(eq(schema.mediaDeletion.storageKey, `chat/${matchId}/${once}.jpg`));
      expect(queued).toHaveLength(1);
    } finally {
      setChatMediaStore(undefined);
    }
  });

  it("marks a photo the classifier flags, for a blurred display and moderation (CHAT-06)", async () => {
    const { a, b, matchId } = await conversation();
    setChatMediaStore(createMemoryObjectStore().store);
    setImageClassifier({ classify: async () => ({ explicit: 0.93 }) });
    try {
      const id = newId();
      const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
      await as(a).messaging.sendImage({
        id,
        matchId,
        file: new File([png], "photo.png", { type: "image/png" }),
        width: 400,
        height: 400,
        viewOnce: false,
        replyTo: null,
      });
      const history = await as(b).messaging.history({ matchId, limit: 10 });
      expect(history.messages.find((m) => m.id === id)?.attachment).toMatchObject({ explicit: true });
      const [stored] = await db
        .select({ moderation: schema.message.moderation })
        .from(schema.message)
        .where(eq(schema.message.id, id));
      expect(stored?.moderation).toEqual({ flags: ["explicit_image"] });
    } finally {
      setImageClassifier(undefined);
      setChatMediaStore(undefined);
    }
  });

  it("sends a voice message with its waveform (CHAT-07)", async () => {
    const { a, b, matchId } = await conversation();
    const { store } = createMemoryObjectStore();
    setChatMediaStore(store);
    try {
      const webm = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 1, 2, 3, 4]);
      const id = newId();
      await as(a).messaging.sendVoice({
        id,
        matchId,
        file: new File([webm], "voice.webm", { type: "audio/webm" }),
        durationMs: 4200,
        waveform: [0.1, 0.5, 0.9, 0.4],
        replyTo: null,
      });
      const history = await as(b).messaging.history({ matchId, limit: 10 });
      expect(history.messages.find((m) => m.id === id)?.attachment).toMatchObject({
        type: "voice",
        durationMs: 4200,
        waveform: [0.1, 0.5, 0.9, 0.4],
        url: expect.stringContaining(`chat/${matchId}/${id}.webm`),
      });
      await expect(
        as(a).messaging.sendVoice({
          id: newId(),
          matchId,
          file: new File(["not audio"], "voice.webm", { type: "audio/webm" }),
          durationMs: 1000,
          waveform: [],
          replyTo: null,
        }),
      ).rejects.toMatchObject({ message: "unsupported_media" });
    } finally {
      setChatMediaStore(undefined);
    }
  });

  it("plays mini-games without showing an answer before the other played (CHAT-11)", async () => {
    const { a, b, matchId } = await conversation();
    const game = (m: { attachment: unknown }) => m.attachment as Extract<MessageAttachment, { type: "game" }>;
    const { message } = await as(a).messaging.startGame({
      id: newId(),
      matchId,
      game: "would_you_rather",
      replyTo: null,
    });
    expect(game(message)).toMatchObject({
      game: "would_you_rather",
      prompt: "Tu préfères…",
      mine: null,
      otherPlayed: false,
    });
    expect(game(message).options).toHaveLength(2);
    const [first, second] = game(message).options;

    const played = await as(b).messaging.playGame({
      matchId,
      messageId: message.id,
      choice: first?.id ?? "",
    });
    expect(game(played.message)).toMatchObject({ mine: first?.id, theirs: null, done: false });
    const seenByA = (await as(a).messaging.history({ matchId, limit: 10 })).messages.find(
      (m) => m.id === message.id,
    );
    expect(game(seenByA ?? { attachment: null })).toMatchObject({
      mine: null,
      theirs: null,
      otherPlayed: true,
    });

    const both = await as(a).messaging.playGame({ matchId, messageId: message.id, choice: second?.id ?? "" });
    expect(game(both.message)).toMatchObject({ mine: second?.id, theirs: first?.id, done: true });
    // Same answer again: idempotent; another one: refused.
    await as(a).messaging.playGame({ matchId, messageId: message.id, choice: second?.id ?? "" });
    await expect(
      as(a).messaging.playGame({ matchId, messageId: message.id, choice: first?.id ?? "" }),
    ).rejects.toMatchObject({ message: "already_played" });
    await expect(
      as(b).messaging.playGame({ matchId, messageId: message.id, choice: "zzz" }),
    ).rejects.toMatchObject({
      message: "invalid_choice",
    });

    // Two people answering at the same moment: both answers kept.
    const quiz = await as(a).messaging.startGame({ id: newId(), matchId, game: "nerd_quiz", replyTo: null });
    const choice = game(quiz.message).options[0]?.id ?? "";
    await Promise.all([
      as(a).messaging.playGame({ matchId, messageId: quiz.message.id, choice }),
      as(b).messaging.playGame({ matchId, messageId: quiz.message.id, choice }),
    ]);
    const quizNow = (await as(a).messaging.history({ matchId, limit: 10 })).messages.find(
      (m) => m.id === quiz.message.id,
    );
    expect(game(quizNow ?? { attachment: null })).toMatchObject({ done: true, mine: choice, theirs: choice });

    const truths = await as(a).messaging.startTwoTruths({
      id: newId(),
      matchId,
      statements: ["J'ai vu une aurore boréale", "Je parle japonais", "J'ai sauté en parachute"],
      lie: 1,
    });
    expect(game(truths.message)).toMatchObject({ author: true, lie: "1" });
    await expect(
      as(a).messaging.playGame({ matchId, messageId: truths.message.id, choice: "1" }),
    ).rejects.toMatchObject({ message: "own_game" });
    const forB = (await as(b).messaging.history({ matchId, limit: 10 })).messages.find(
      (m) => m.id === truths.message.id,
    );
    expect(game(forB ?? { attachment: null })).toMatchObject({ author: false, lie: null, done: false });
    expect(game(forB ?? { attachment: null }).options.map((o) => o.label)).toContain("Je parle japonais");
    const guess = await as(b).messaging.playGame({ matchId, messageId: truths.message.id, choice: "2" });
    expect(game(guess.message)).toMatchObject({ mine: "2", lie: "1", done: true });
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
