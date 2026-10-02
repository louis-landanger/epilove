import { uuidv7 } from "@epilove/core";
import { createDatabase, schema } from "@epilove/db";
import { notifyDueCheckIns } from "@epilove/db/repositories/messaging-date-safety";
import { cleanupTestMembers, createTestMember, prepareTestDatabase } from "@epilove/db/testing";
import { createMemoryPublisher } from "@epilove/realtime";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { setRealtimePublisher } from "../rencontre/realtime";
import { createTestApi } from "../rencontre/testing";

const url = process.env.DATABASE_URL;
const newId = () => uuidv7(Date.now(), crypto.getRandomValues(new Uint8Array(10)));

describe.skipIf(!url)("date safety kit (IRL-03)", () => {
  const { db, close } = createDatabase(url ?? "", { maxConnections: 4 });
  const { as } = createTestApi(db);
  beforeAll(async () => {
    await prepareTestDatabase(db);
    setRealtimePublisher(createMemoryPublisher().publisher);
  });
  afterAll(async () => {
    setRealtimePublisher(undefined);
    await cleanupTestMembers(db);
    await close();
  });

  /** Alix proposes a date tomorrow evening; Bao accepts it unless told otherwise. */
  async function date(options: { accept?: boolean } = {}) {
    const a = await createTestMember(db, { firstName: "Alix" });
    const b = await createTestMember(db, { firstName: "Bao" });
    await as(a).discovery.decide({ targetId: b, kind: "like", content: null, comment: null });
    const { matchId } = await as(b).discovery.decide({
      targetId: a,
      kind: "like",
      content: null,
      comment: null,
    });
    const startsAt = new Date(Date.now() + 26 * 3_600_000);
    startsAt.setUTCMinutes(0, 0, 0);
    const { message } = await as(a).messaging.proposeDate({
      id: newId(),
      matchId: matchId ?? "",
      spotId: null,
      place: "Place Valmy",
      startsAt: startsAt.toISOString(),
      note: "",
      counterTo: null,
    });
    if (options.accept !== false) {
      await as(b).messaging.respondDate({
        matchId: matchId ?? "",
        messageId: message.id,
        response: "accept",
      });
    }
    return { a, b, matchId: matchId ?? "", messageId: message.id, startsAt };
  }

  const tokenOf = (path: string | undefined) => path?.replace("/partage/", "") ?? "";

  it("shares an accepted date with a trusted person, who sees the check-in", async () => {
    const { a, b, matchId, messageId, startsAt } = await date();
    const id = newId();
    const { kit } = await as(a).dateSafety.share({ id, matchId, messageId });
    expect(kit).toMatchObject({ otherFirstName: "Bao", place: "Place Valmy", checkIn: null });
    expect(kit.shares).toHaveLength(1);
    const token = tokenOf(kit.shares[0]?.path);
    expect(token.length).toBeGreaterThan(40);

    // Retrying returns the same link.
    const again = await as(a).dateSafety.share({ id, matchId, messageId });
    expect(again.kit.shares.map((s) => s.path)).toEqual(kit.shares.map((s) => s.path));

    // No account needed for the trusted person.
    const shared = await as(null).dateSafety.shared({ token });
    expect(shared).toMatchObject({
      sharerFirstName: "Alix",
      otherFirstName: "Bao",
      place: "Place Valmy",
      startsAt: startsAt.toISOString(),
      mapUrl: null,
      checkIn: null,
    });
    // The token is not stored in clear.
    const [row] = await db.select().from(schema.dateShare).where(eq(schema.dateShare.id, id));
    expect(row?.tokenHash).not.toContain(token);
    expect(new TextDecoder().decode(row?.tokenEncrypted)).not.toContain(token);

    // Someone else's link is "not found", even for the other member of the date.
    await expect(as(b).dateSafety.kit({ shareId: id })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(as(b).dateSafety.checkIn({ shareId: id, answer: "ok" })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });

    await as(a).dateSafety.checkIn({ shareId: id, answer: "ok" });
    expect((await as(null).dateSafety.shared({ token })).checkIn?.answer).toBe("ok");
    expect((await as(a).dateSafety.kit({ messageId })).kit?.checkIn).toBe("ok");

    // Revoking stops the link at once.
    const revoked = await as(a).dateSafety.revoke({ shareId: id });
    expect(revoked.kit.shares[0]?.state).toBe("revoked");
    await expect(as(null).dateSafety.shared({ token })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(as(null).dateSafety.shared({ token: "x".repeat(43) })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("only shares accepted dates, a few times each", async () => {
    const pending = await date({ accept: false });
    await expect(
      as(pending.a).dateSafety.share({ id: newId(), matchId: pending.matchId, messageId: pending.messageId }),
    ).rejects.toMatchObject({ message: "not_accepted" });

    const { a, matchId, messageId } = await date();
    for (let i = 0; i < 3; i++) {
      await as(a).dateSafety.share({ id: newId(), matchId, messageId });
    }
    await expect(as(a).dateSafety.share({ id: newId(), matchId, messageId })).rejects.toMatchObject({
      message: "too_many",
    });
  });

  it("asks once per date whether everything went well, even after a block", async () => {
    const { a, b, matchId, messageId, startsAt } = await date();
    const first = newId();
    await as(a).dateSafety.share({ id: first, matchId, messageId });
    await as(a).dateSafety.share({ id: newId(), matchId, messageId });
    await db.insert(schema.block).values({ blockerId: a, blockedId: b });

    expect(await notifyDueCheckIns(db, new Date(startsAt.getTime() + 2 * 3_600_000))).toBe(0);
    const later = new Date(startsAt.getTime() + 3 * 3_600_000 + 60_000);
    expect(await notifyDueCheckIns(db, later)).toBeGreaterThanOrEqual(1);
    expect(await notifyDueCheckIns(db, later)).toBe(0);
    const sent = await db
      .select({ payload: schema.notification.payload })
      .from(schema.notification)
      .where(and(eq(schema.notification.userId, a), eq(schema.notification.type, "date_check_in")));
    expect(sent).toHaveLength(1);

    // The kit still works although the conversation is closed.
    const { kit } = await as(a).dateSafety.checkIn({ shareId: first, answer: "help" });
    expect(kit).toMatchObject({ checkIn: "help", otherUserId: b });
  });
});
