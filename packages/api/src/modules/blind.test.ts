import { blindEvening, LYON_CAMPUS, uuidv7 } from "@epilove/core";
import { createDatabase } from "@epilove/db";
import { saveDeckFilter } from "@epilove/db/repositories/discovery";
import { cleanupTestMembers, createTestMember, prepareTestDatabase } from "@epilove/db/testing";
import { createMemoryPublisher } from "@epilove/realtime";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { setRealtimePublisher } from "../rencontre/realtime";
import { createTestApi } from "../rencontre/testing";

const url = process.env.DATABASE_URL;
const newId = () => uuidv7(Date.now(), crypto.getRandomValues(new Uint8Array(10)));

describe.skipIf(!url)("blind mode (DEC-10)", () => {
  const { db, close } = createDatabase(url ?? "", { maxConnections: 4 });
  const { as } = createTestApi(db);
  const evening = blindEvening(new Date(), LYON_CAMPUS.timeZone);
  beforeAll(async () => {
    await prepareTestDatabase(db);
    setRealtimePublisher(createMemoryPublisher().publisher);
  });
  afterEach(() => {
    vi.useRealTimers();
  });
  afterAll(async () => {
    setRealtimePublisher(undefined);
    await cleanupTestMembers(db);
    await close();
  });

  const at = (instant: Date) => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(instant);
  };

  it("offers a deck without photos on the blind evening only, and reveals after ten messages each", async () => {
    const viewer = await createTestMember(db, {
      firstName: "Nina",
      gender: "woman",
      interestedIn: ["man"],
      graduationYear: 2036,
      prompts: ["Toujours partante pour un quiz."],
    });
    const reader = await createTestMember(db, {
      firstName: "Oscar",
      gender: "man",
      interestedIn: ["woman"],
      graduationYear: 2036,
      prompts: ["Je collectionne les cartes de métro."],
    });
    // No prompt: nothing to read in a blind deck.
    await createTestMember(db, { gender: "man", interestedIn: ["woman"], graduationYear: 2036 });
    await saveDeckFilter(db, viewer, {
      mode: "all",
      schoolSlugs: [],
      graduationYears: [2036],
      intentions: [],
      ageMin: null,
      ageMax: null,
    });

    at(new Date(evening.startsAt.getTime() - 3_600_000));
    await expect(
      as(viewer).discovery.deck({ locale: "fr", limit: 20, exclude: [], blind: true }),
    ).rejects.toMatchObject({
      message: "not_blind_evening",
    });
    expect(
      (await as(viewer).discovery.deck({ locale: "fr", limit: 20, exclude: [] })).blindEvening.active,
    ).toBe(false);

    at(new Date(evening.startsAt.getTime() + 30 * 60_000));
    const deck = await as(viewer).discovery.deck({ locale: "fr", limit: 20, exclude: [], blind: true });
    expect(deck.blindEvening.active).toBe(true);
    expect(deck.cards.map((c) => c.userId)).toEqual([reader]);
    expect(deck.cards[0]).toMatchObject({ blind: true, photos: [] });
    expect(deck.cards[0]?.prompts).toHaveLength(1);

    await as(viewer).discovery.decide({
      targetId: reader,
      kind: "like",
      content: null,
      comment: null,
      blind: true,
    });
    // The other one decides blind too: the liker's photos stay hidden in their likes.
    const likes = await as(reader).discovery.likesReceived({ locale: "fr" });
    expect(likes.likes.find((l) => l.card.userId === viewer)?.card).toMatchObject({
      blind: true,
      photos: [],
    });
    const { matchId } = await as(reader).discovery.decide({
      targetId: viewer,
      kind: "like",
      content: null,
      comment: null,
    });

    const thread = await as(viewer).messaging.thread({ matchId: matchId ?? "", locale: "fr" });
    expect(thread.blind).toEqual({ mine: 0, theirs: 0, needed: 10 });
    expect(thread.other.photoUrl).toBeNull();
    const listed = (await as(viewer).matches.list({ locale: "fr" })).matches.find(
      (m) => m.matchId === matchId,
    );
    expect(listed?.other.photoUrl).toBeNull();
    expect((await as(viewer).discovery.profile({ userId: reader, locale: "fr" })).card.photos).toEqual([]);

    for (let i = 0; i < 10; i++) {
      await as(viewer).messaging.send({
        id: newId(),
        matchId: matchId ?? "",
        text: `Nina ${i}`,
        replyTo: null,
      });
      await as(reader).messaging.send({
        id: newId(),
        matchId: matchId ?? "",
        text: `Oscar ${i}`,
        replyTo: null,
      });
    }
    const revealed = await as(viewer).messaging.thread({ matchId: matchId ?? "", locale: "fr" });
    expect(revealed.blind).toBeNull();
    expect(revealed.other.photoUrl).not.toBeNull();
    const profile = await as(viewer).discovery.profile({ userId: reader, locale: "fr" });
    expect(profile.card).toMatchObject({ blind: false });
    expect(profile.card.photos).toHaveLength(1);
  });
});
