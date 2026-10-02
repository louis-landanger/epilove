import { createDatabase, schema } from "@epilove/db";
import { cleanupTestMembers, createTestMember, prepareTestDatabase } from "@epilove/db/testing";
import { and, eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestApi } from "../rencontre/testing";

const url = process.env.DATABASE_URL;

describe.skipIf(!url)("events (IRL-01)", () => {
  const { db, close } = createDatabase(url ?? "", { maxConnections: 4 });
  const { as } = createTestApi(db);
  const created: string[] = [];
  beforeAll(() => prepareTestDatabase(db));
  afterAll(async () => {
    if (created.length > 0) {
      await db.delete(schema.event).where(inArray(schema.event.id, created));
    }
    await cleanupTestMembers(db);
    await close();
  });

  const inDays = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString();

  async function organizer(schoolSlug: "epita" | "isg" | "ipsa" = "isg") {
    return createTestMember(db, { schoolSlug, graduationYear: 2038, role: "organizer" });
  }

  async function publish(organizerId: string, overrides: Record<string, unknown> = {}) {
    const { eventId } = await as(organizerId).events.create({
      title: "Afterwork de rentrée",
      organizerName: "BDE (test)",
      description: "Musique et jus de fruits.",
      venue: "Place Valmy",
      spotId: null,
      startsAt: inDays(7),
      endsAt: null,
      schoolSlugs: [],
      ...overrides,
    });
    created.push(eventId);
    return eventId;
  }

  async function matchBetween(a: string, b: string) {
    const [userLow, userHigh] = a < b ? [a, b] : [b, a];
    await db.insert(schema.match).values({ userLow, userHigh, mode: "friends", source: "like" });
  }

  it("lets organizers publish, and nobody else", async () => {
    const member = await createTestMember(db, { graduationYear: 2038 });
    await expect(
      as(member).events.create({
        title: "Soirée",
        organizerName: "Moi",
        description: "",
        venue: "Chez moi",
        spotId: null,
        startsAt: inDays(3),
        endsAt: null,
        schoolSlugs: [],
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect((await as(member).events.list({ filter: "upcoming" })).canOrganize).toBe(false);

    const host = await organizer();
    expect((await as(host).events.list({ filter: "upcoming" })).canOrganize).toBe(true);
    const eventId = await publish(host);
    const listed = (await as(member).events.list({ filter: "upcoming" })).events.find(
      (e) => e.id === eventId,
    );
    expect(listed).toMatchObject({
      title: "Afterwork de rentrée",
      organizerName: "BDE (test)",
      organizing: false,
    });
    await expect(publish(host, { startsAt: inDays(-1) })).rejects.toMatchObject({ message: "in_the_past" });

    // A withdrawn role applies at once.
    await db.update(schema.appUser).set({ role: "user" }).where(eq(schema.appUser.id, host));
    await expect(as(host).events.cancel({ eventId })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("keeps an event for some schools away from the others", async () => {
    const host = await organizer("ipsa");
    const eventId = await publish(host, { schoolSlugs: ["ipsa"] });
    const ipsa = await createTestMember(db, { schoolSlug: "ipsa", graduationYear: 2038 });
    const epita = await createTestMember(db, { schoolSlug: "epita", graduationYear: 2038 });
    expect((await as(ipsa).events.get({ eventId, locale: "fr" })).event.schoolSlugs).toEqual(["ipsa"]);
    await expect(as(epita).events.get({ eventId, locale: "fr" })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    const list = await as(epita).events.list({ filter: "upcoming" });
    expect(list.events.map((e) => e.id)).not.toContain(eventId);
    await expect(
      as(epita).events.rsvp({ eventId, status: "going", shareWithMatches: false }),
    ).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("records one answer per member, idempotently", async () => {
    const eventId = await publish(await organizer());
    const member = await createTestMember(db, { graduationYear: 2038 });
    await as(member).events.rsvp({ eventId, status: "going", shareWithMatches: false });
    const again = await as(member).events.rsvp({ eventId, status: "going", shareWithMatches: false });
    expect(again.event).toMatchObject({
      going: 1,
      maybe: 0,
      mine: { status: "going", shareWithMatches: false },
    });
    const maybe = await as(member).events.rsvp({ eventId, status: "maybe", shareWithMatches: true });
    expect(maybe.event).toMatchObject({
      going: 0,
      maybe: 1,
      mine: { status: "maybe", shareWithMatches: true },
    });
    expect((await as(member).events.list({ filter: "mine" })).events.map((e) => e.id)).toContain(eventId);
    const withdrawn = await as(member).events.rsvp({ eventId, status: null, shareWithMatches: false });
    expect(withdrawn.event).toMatchObject({ going: 0, maybe: 0, mine: null });
  });

  it("shows matches going only when both share it, never across a block", async () => {
    const eventId = await publish(await organizer());
    const viewer = await createTestMember(db, { firstName: "Vic", graduationYear: 2038 });
    const sharing = await createTestMember(db, { firstName: "Sam", graduationYear: 2038 });
    const shy = await createTestMember(db, { firstName: "Tom", graduationYear: 2038 });
    const stranger = await createTestMember(db, { firstName: "Ugo", graduationYear: 2038 });
    const blocked = await createTestMember(db, { firstName: "Zoé", graduationYear: 2038 });
    for (const other of [sharing, shy, blocked]) {
      await matchBetween(viewer, other);
    }
    await as(sharing).events.rsvp({ eventId, status: "going", shareWithMatches: true });
    await as(shy).events.rsvp({ eventId, status: "going", shareWithMatches: false });
    await as(stranger).events.rsvp({ eventId, status: "going", shareWithMatches: true });
    await as(blocked).events.rsvp({ eventId, status: "maybe", shareWithMatches: true });
    await db.insert(schema.block).values({ blockerId: blocked, blockedId: viewer });

    // Not sharing: sees nobody (reciprocity).
    await as(viewer).events.rsvp({ eventId, status: "maybe", shareWithMatches: false });
    expect((await as(viewer).events.get({ eventId, locale: "fr" })).matchesGoing).toBeNull();

    await as(viewer).events.rsvp({ eventId, status: "maybe", shareWithMatches: true });
    const seen = await as(viewer).events.get({ eventId, locale: "fr" });
    expect(seen.matchesGoing?.map((m) => m.firstName)).toEqual(["Sam"]);
    expect(seen.event.going).toBe(3);

    // The other side sees the viewer too, and the shy match sees nobody.
    expect(
      (await as(sharing).events.get({ eventId, locale: "fr" })).matchesGoing?.map((m) => m.firstName),
    ).toEqual(["Vic"]);
    expect((await as(shy).events.get({ eventId, locale: "fr" })).matchesGoing).toBeNull();
  });

  it("cancels an event, tells the members who answered and closes the answers", async () => {
    const host = await organizer();
    const eventId = await publish(host);
    const member = await createTestMember(db, { graduationYear: 2038 });
    await as(member).events.rsvp({ eventId, status: "going", shareWithMatches: false });

    const otherHost = await organizer();
    await expect(as(otherHost).events.cancel({ eventId })).rejects.toMatchObject({ code: "NOT_FOUND" });

    await as(host).events.cancel({ eventId });
    await as(host).events.cancel({ eventId });
    const notifications = await db
      .select({ payload: schema.notification.payload })
      .from(schema.notification)
      .where(and(eq(schema.notification.userId, member), eq(schema.notification.type, "event_cancelled")));
    expect(notifications).toEqual([{ payload: { eventId } }]);
    const listed = (await as(member).events.list({ filter: "upcoming" })).events.find(
      (e) => e.id === eventId,
    );
    expect(listed?.status).toBe("cancelled");
    const latecomer = await createTestMember(db, { graduationYear: 2038 });
    expect((await as(latecomer).events.list({ filter: "upcoming" })).events.map((e) => e.id)).not.toContain(
      eventId,
    );
    await expect(
      as(member).events.rsvp({ eventId, status: "maybe", shareWithMatches: false }),
    ).rejects.toMatchObject({
      message: "closed",
    });
  });
});
