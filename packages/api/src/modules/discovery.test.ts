import { uuidv7, VERIFICATION_GESTURES } from "@epilove/core";
import { createDatabase, schema } from "@epilove/db";
import {
  advanceVerification,
  decideVerification,
  insertVerification,
} from "@epilove/db/repositories/profiles-verification";
import { cleanupTestMembers, createTestMember, prepareTestDatabase } from "@epilove/db/testing";
import { and, eq, or } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestApi } from "../rencontre/testing";

const url = process.env.DATABASE_URL;
/** Graduation year used only by this file, so deck filters isolate its fixtures from other data. */
const YEAR = 2036;

describe.skipIf(!url)("discovery", () => {
  const { db, close } = createDatabase(url ?? "", { maxConnections: 12 });
  const { as } = createTestApi(db);

  const member = (options: Parameters<typeof createTestMember>[1] = {}) =>
    createTestMember(db, { graduationYear: YEAR, ...options });
  const onlyFixtures = (id: string) =>
    as(id).discovery.saveFilters({
      mode: "all",
      schoolSlugs: [],
      graduationYears: [YEAR],
      intentions: [],
      ageMin: null,
      ageMax: null,
    });

  beforeAll(async () => {
    await prepareTestDatabase(db);
  });
  afterAll(async () => {
    await cleanupTestMembers(db);
    await close();
  });

  it("shows eligible members and never the blocked, hidden or the viewer", async () => {
    const viewer = await member({ gender: "woman", interestedIn: ["man"] });
    const visible = await member({ gender: "man", interestedIn: ["woman"], schoolSlug: "isg" });
    const blocker = await member({ gender: "man", interestedIn: ["woman"], schoolSlug: "esme" });
    const paused = await member({ gender: "man", interestedIn: ["woman"], status: "paused" });
    const noPhoto = await member({ gender: "man", interestedIn: ["woman"], photos: 0 });
    await db.insert(schema.block).values({ blockerId: blocker, blockedId: viewer });
    await onlyFixtures(viewer);

    const seen = new Set<string>();
    let exclude: string[] = [];
    for (let page = 0; page < 10; page++) {
      const { cards } = await as(viewer).discovery.deck({ locale: "fr", limit: 20, exclude });
      if (cards.length === 0) {
        break;
      }
      for (const card of cards) {
        expect(seen.has(card.userId)).toBe(false);
        seen.add(card.userId);
      }
      exclude = [...seen].slice(-100);
    }
    expect(seen.has(visible)).toBe(true);
    for (const hidden of [viewer, blocker, paused, noPhoto]) {
      expect(seen.has(hidden)).toBe(false);
    }
  });

  it("creates a match when the like is reciprocal, with events and notifications", async () => {
    const a = await member({ gender: "woman", interestedIn: ["man"] });
    const b = await member({ gender: "man", interestedIn: ["woman"] });
    const first = await as(a).discovery.decide({
      targetId: b,
      kind: "like",
      content: null,
      comment: "Coucou",
    });
    expect(first.outcome).toBe("liked");
    expect(first.quota.likesLeft).toBe(19);

    const second = await as(b).discovery.decide({ targetId: a, kind: "like", content: null, comment: null });
    expect(second.outcome).toBe("matched");
    expect(second.matchId).toBeTruthy();

    // Liking again is idempotent and returns the same match.
    const again = await as(b).discovery.decide({ targetId: a, kind: "like", content: null, comment: null });
    expect(again).toMatchObject({ outcome: "matched", matchId: second.matchId });

    const [m] = await db
      .select()
      .from(schema.match)
      .where(eq(schema.match.id, second.matchId ?? ""));
    expect(m).toMatchObject({ mode: "love", source: "like", status: "active" });
    const notifications = await db
      .select({ type: schema.notification.type })
      .from(schema.notification)
      .where(or(eq(schema.notification.userId, a), eq(schema.notification.userId, b)));
    expect(notifications.map((n) => n.type).sort()).toEqual([
      "like_received",
      "match_created",
      "match_created",
    ]);
  });

  it("creates exactly one match when two members like each other at the same time", async () => {
    const pairs = await Promise.all(
      Array.from(
        { length: 8 },
        async () => [await member({ gender: "nonbinary" }), await member({ gender: "nonbinary" })] as const,
      ),
    );
    await Promise.all(
      pairs.flatMap(([a, b]) => [
        as(a).discovery.decide({ targetId: b, kind: "like", content: null, comment: null }),
        as(b).discovery.decide({ targetId: a, kind: "like", content: null, comment: null }),
      ]),
    );
    for (const [a, b] of pairs) {
      const [low, high] = a < b ? [a, b] : [b, a];
      const matches = await db
        .select()
        .from(schema.match)
        .where(and(eq(schema.match.userLow, low), eq(schema.match.userHigh, high)));
      expect(matches).toHaveLength(1);
    }
  });

  it("enforces the daily quotas on the server", async () => {
    const newcomer = await member({ createdAt: new Date() });
    const targets = await Promise.all(Array.from({ length: 11 }, () => member()));
    for (const target of targets.slice(0, 10)) {
      await as(newcomer).discovery.decide({ targetId: target, kind: "like", content: null, comment: null });
    }
    const last = targets[10] ?? "";
    await expect(
      as(newcomer).discovery.decide({ targetId: last, kind: "like", content: null, comment: null }),
    ).rejects.toMatchObject({ code: "QUOTA_EXCEEDED" });
    await expect(
      as(newcomer).discovery.decide({ targetId: last, kind: "pass", content: null, comment: null }),
    ).resolves.toMatchObject({ outcome: "passed" });
  });

  it("requires a comment with a super like and allows one per day", async () => {
    const actor = await member();
    const [t1, t2] = [await member(), await member()];
    await expect(
      as(actor).discovery.decide({ targetId: t1, kind: "superlike", content: null, comment: null }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await as(actor).discovery.decide({
      targetId: t1,
      kind: "superlike",
      content: null,
      comment: "Ta réponse !",
    });
    await expect(
      as(actor).discovery.decide({ targetId: t2, kind: "superlike", content: null, comment: "Encore" }),
    ).rejects.toMatchObject({ code: "QUOTA_EXCEEDED" });
  });

  it("only accepts liked content that belongs to the target", async () => {
    const actor = await member();
    const target = await member();
    const other = await member();
    const [otherPhoto] = await db
      .select({ id: schema.photo.id })
      .from(schema.photo)
      .where(eq(schema.photo.userId, other));
    const [targetPhoto] = await db
      .select({ id: schema.photo.id })
      .from(schema.photo)
      .where(eq(schema.photo.userId, target));
    await expect(
      as(actor).discovery.decide({
        targetId: target,
        kind: "like",
        content: { type: "photo", id: otherPhoto?.id ?? "" },
        comment: null,
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(
      as(actor).discovery.decide({
        targetId: target,
        kind: "like",
        content: { type: "photo", id: targetPhoto?.id ?? "" },
        comment: "Belle photo",
      }),
    ).resolves.toMatchObject({ outcome: "liked" });
  });

  it("undoes the last pass once a day", async () => {
    const actor = await member();
    const target = await member();
    await as(actor).discovery.decide({ targetId: target, kind: "pass", content: null, comment: null });
    const undo = await as(actor).discovery.undo({ locale: "fr" });
    expect(undo.restored?.userId).toBe(target);
    expect(undo.quota.undosLeft).toBe(0);
    await as(actor).discovery.decide({ targetId: target, kind: "pass", content: null, comment: null });
    await expect(as(actor).discovery.undo({ locale: "fr" })).rejects.toMatchObject({
      code: "QUOTA_EXCEEDED",
    });
  });

  it("lists likes received, without blocked members, and opens their profile", async () => {
    const viewer = await member();
    const liker = await member({ firstName: "Lina" });
    const blockedLiker = await member();
    await as(liker).discovery.decide({ targetId: viewer, kind: "like", content: null, comment: "Salut !" });
    await as(blockedLiker).discovery.decide({ targetId: viewer, kind: "like", content: null, comment: null });
    await db.insert(schema.block).values({ blockerId: viewer, blockedId: blockedLiker });

    const { likes } = await as(viewer).discovery.likesReceived({ locale: "fr" });
    expect(likes.map((l) => l.card.userId)).toEqual([liker]);
    expect(likes[0]).toMatchObject({ kind: "like", comment: "Salut !", card: { firstName: "Lina" } });

    const profile = await as(viewer).discovery.profile({ userId: liker, locale: "fr" });
    expect(profile).toMatchObject({ likedYou: true, canLike: true, matchId: null });
    await expect(as(viewer).discovery.profile({ userId: blockedLiker, locale: "fr" })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(
      as(viewer).discovery.decide({ targetId: blockedLiker, kind: "like", content: null, comment: null }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("shows the verified photo and campus badges from the verifications (ONB-08, ONB-11)", async () => {
    const viewer = await member();
    const target = await member({ firstName: "Vérane" });
    const before = await as(viewer).discovery.profile({ userId: target, locale: "fr" });
    expect(before.card.badges).not.toContain("photo_verified");

    const moderator = await member();
    const id = uuidv7();
    const at = new Date();
    await insertVerification(db, {
      id,
      userId: target,
      gesture: VERIFICATION_GESTURES[0],
      storageKey: `verification/${id}`,
      createdAt: at,
    });
    await advanceVerification(db, id, "uploading", "pending");
    await decideVerification(db, id, { status: "approved", rejection: null, reviewedBy: moderator, at });

    const after = await as(viewer).discovery.profile({ userId: target, locale: "fr" });
    expect(after.card.badges).toContain("photo_verified");
    expect(after.card.badges).not.toContain("campus_verified");

    // Forge ID confirmed the Lyon campus (ONB-11).
    await db.update(schema.appUser).set({ campusVerifiedAt: at }).where(eq(schema.appUser.id, target));
    const campus = await as(viewer).discovery.profile({ userId: target, locale: "fr" });
    expect(campus.card.badges).toEqual(expect.arrayContaining(["photo_verified", "campus_verified"]));
  });

  it("plays the voice answers of a visible profile through signed URLs (PRO-06)", async () => {
    const viewer = await member();
    const target = await member({ prompts: ["Écoute plutôt", "Pas de vocal ici"] });
    const [spoken] = await db
      .select({ id: schema.promptAnswer.id })
      .from(schema.promptAnswer)
      .where(and(eq(schema.promptAnswer.userId, target), eq(schema.promptAnswer.position, 0)));
    await db
      .update(schema.promptAnswer)
      .set({
        voiceKey: `voice/${spoken?.id}.webm`,
        voiceStage: "ready",
        voiceContentType: "audio/webm",
        voiceDurationMs: 4200,
        voicePeaks: [10, 80, 40],
      })
      .where(eq(schema.promptAnswer.id, spoken?.id ?? ""));

    const { card } = await as(viewer).discovery.profile({ userId: target, locale: "fr" });
    const [withVoice, withoutVoice] = card.prompts;
    expect(withVoice?.voice).toMatchObject({ durationMs: 4200, peaks: [10, 80, 40] });
    expect(withVoice?.voice?.url).toMatch(new RegExp(`^/api/voice/${spoken?.id}\\?exp=\\d+&sig=[\\w-]+$`));
    expect(withoutVoice?.voice).toBeNull();
  });

  it("does not let a restricted account like", async () => {
    const restricted = await member({ status: "restricted" });
    const target = await member();
    await expect(
      as(restricted).discovery.decide({ targetId: target, kind: "like", content: null, comment: null }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
