import { createDatabase, schema } from "@epilove/db";
import { createEvent } from "@epilove/db/repositories/campus-events";
import { saveNotificationPreferences } from "@epilove/db/repositories/notifications";
import {
  cleanupTestMembers,
  createTestMember,
  prepareTestDatabase,
  testMemberEmail,
} from "@epilove/db/testing";
import { createMemoryMailer } from "@epilove/email";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sendWeeklyDigests } from "./digest";

const url = process.env.DATABASE_URL;

describe.skipIf(!url)("weekly digest (NOT-05)", () => {
  const { db, close } = createDatabase(url ?? "", { maxConnections: 4 });
  beforeAll(() => prepareTestDatabase(db));
  afterAll(async () => {
    await cleanupTestMembers(db);
    await close();
  });

  it("sends the chosen groups once a week, to members who opted in only", async () => {
    const now = new Date();
    const reader = await createTestMember(db, { firstName: "Romy", graduationYear: 2038 });
    const silent = await createTestMember(db, { graduationYear: 2038 });
    const quiet = await createTestMember(db, { graduationYear: 2038 });
    const [fan, otherFan, blocked] = [
      await createTestMember(db, { graduationYear: 2038 }),
      await createTestMember(db, { graduationYear: 2038 }),
      await createTestMember(db, { graduationYear: 2038 }),
    ];
    await saveNotificationPreferences(
      db,
      reader,
      new Map([
        ["likes", { push: true, email: true }],
        ["events", { push: true, email: true }],
      ]),
    );
    // Opted in, but with nothing to tell this week: no e-mail.
    await saveNotificationPreferences(db, quiet, new Map([["matches", { push: true, email: true }]]));
    await db.insert(schema.likeAction).values([
      { actorId: fan, targetId: reader, kind: "like" },
      { actorId: otherFan, targetId: reader, kind: "superlike" },
      { actorId: blocked, targetId: reader, kind: "like" },
      { actorId: reader, targetId: silent, kind: "like" },
    ]);
    await db.insert(schema.block).values({ blockerId: reader, blockedId: blocked });
    await createEvent(db, fan, {
      organizerName: "BDE (test)",
      title: "Soirée quiz du digest",
      description: "",
      venue: "Foyer",
      spotId: null,
      startsAt: new Date(now.getTime() + 2 * 86_400_000),
      endsAt: null,
      schoolIds: [],
    });

    const mailer = createMemoryMailer();
    const { sent } = mailer;
    const only = [reader, silent, quiet];
    const first = await sendWeeklyDigests(db, mailer, { now, appUrl: "https://app.example", only });
    expect(first).toMatchObject({ sent: 1, empty: 1, failed: 0 });
    expect(sent.map((m) => m.to)).toEqual([testMemberEmail(reader)]);
    const mail = sent[0]?.email;
    expect(mail?.text).toContain("2 personnes t'ont liké cette semaine.");
    expect(mail?.text).toContain("Soirée quiz du digest");
    // Never a first name in the digest.
    expect(mail?.text).not.toContain("Romy");
    expect(mail?.unsubscribeUrl).toBe("https://app.example/reglages/notifications");

    const again = await sendWeeklyDigests(db, mailer, { now, appUrl: "https://app.example", only });
    expect(again).toMatchObject({ sent: 0, empty: 0 });
    expect(sent).toHaveLength(1);
  });

  it("gives the week back after a failed send, for the next run", async () => {
    const member = await createTestMember(db, { graduationYear: 2038 });
    const fan = await createTestMember(db, { graduationYear: 2038 });
    await saveNotificationPreferences(db, member, new Map([["likes", { push: true, email: true }]]));
    await db.insert(schema.likeAction).values({ actorId: fan, targetId: member, kind: "like" });
    const failing = {
      send: async () => {
        throw new Error("SMTP down");
      },
    };
    const now = new Date();
    expect(
      await sendWeeklyDigests(db, failing, { now, appUrl: "https://app.example", only: [member] }),
    ).toMatchObject({
      failed: 1,
    });
    const mailer = createMemoryMailer();
    expect(
      await sendWeeklyDigests(db, mailer, { now, appUrl: "https://app.example", only: [member] }),
    ).toMatchObject({
      sent: 1,
    });
    expect(mailer.sent[0]?.email.text).toContain("1 personne t'a liké cette semaine.");
  });

  it("writes in the language the member chose (PLT-04)", async () => {
    const member = await createTestMember(db, { graduationYear: 2038 });
    const fan = await createTestMember(db, { graduationYear: 2038 });
    await db.update(schema.appUser).set({ locale: "en" }).where(eq(schema.appUser.id, member));
    await saveNotificationPreferences(db, member, new Map([["likes", { push: true, email: true }]]));
    await db.insert(schema.likeAction).values({ actorId: fan, targetId: member, kind: "like" });
    const mailer = createMemoryMailer();
    await sendWeeklyDigests(db, mailer, { now: new Date(), appUrl: "https://app.example", only: [member] });
    expect(mailer.sent[0]?.email.subject).toBe("Your week on Epilove");
    expect(mailer.sent[0]?.email.text).toContain("1 person liked you this week.");
  });
});
