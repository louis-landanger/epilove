import { uuidv7 } from "@epilove/core";
import { schema } from "@epilove/db";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestApi, insertActiveMember } from "../test-support";

const url = process.env.DATABASE_URL;

/** Needs a disposable PostgreSQL (`pnpm services:up` locally, a service container in CI). */
describe.skipIf(!url)("back-office", () => {
  const api = createTestApi(url ?? "");
  beforeAll(api.prepare);
  afterAll(api.close);

  async function readyPhoto(userId: string) {
    const id = uuidv7();
    await api.db.insert(schema.photo).values({
      id,
      userId,
      storageKey: `photos/${userId}/${id}.webp`,
      position: 0,
      stage: "ready",
      width: 900,
      height: 1125,
    });
    return id;
  }

  async function emailOf(userId: string) {
    const [row] = await api.db
      .select({ email: schema.appUser.email })
      .from(schema.appUser)
      .where(eq(schema.appUser.id, userId));
    return row?.email ?? "";
  }

  it("is closed to members and catalogue editing is reserved to admins", async () => {
    const member = api.clientFor(await insertActiveMember(api.db));
    await expect(member.admin.overview()).rejects.toMatchObject({ code: "FORBIDDEN" });
    const moderator = api.clientFor(await insertActiveMember(api.db), "moderator");
    await expect(moderator.admin.overview()).resolves.toMatchObject({ openReports: expect.any(Object) });
    await expect(moderator.admin.catalog()).rejects.toMatchObject({ code: "FORBIDDEN" });
    const me = await moderator.admin.me();
    expect(me.pseudonym).toMatch(/^M-[A-Z2-9]{6}$/);
  });

  it("approves and rejects photos, telling the member why", async () => {
    const owner = await insertActiveMember(api.db);
    const first = await readyPhoto(owner);
    const second = await readyPhoto(owner);
    const moderator = api.clientFor(await insertActiveMember(api.db), "moderator");

    const queue = await moderator.admin.photoQueue({ limit: 100 });
    expect(queue.photos.map((photo) => photo.id)).toEqual(expect.arrayContaining([first, second]));
    const queued = queue.photos.find((photo) => photo.id === first);
    expect(queued?.member.pseudonym).toMatch(/^M-/);
    expect(JSON.stringify(queued)).not.toContain("Alex");

    await moderator.admin.moderatePhoto({ photoId: first, decision: "approve" });
    await moderator.admin.moderatePhoto({ photoId: second, decision: "reject", reason: "contact_details" });
    const rows = await api.db.select().from(schema.photo).where(eq(schema.photo.userId, owner));
    expect(Object.fromEntries(rows.map((row) => [row.id, row.status]))).toEqual({
      [first]: "approved",
      [second]: "rejected",
    });
    const ownerEmail = await emailOf(owner);
    const mail = api.mailer.sent.find((entry) => entry.to === ownerEmail);
    expect(mail?.email.text).toContain("coordonnées");
    const audit = await api.db.select().from(schema.auditLog).where(eq(schema.auditLog.targetId, second));
    expect(audit.map((entry) => entry.action)).toEqual(["photo.rejected"]);
  });

  it("decides on a report with a statement, applies it and informs both people", async () => {
    const reporter = await insertActiveMember(api.db);
    const reported = await insertActiveMember(api.db);
    const moderatorId = await insertActiveMember(api.db);
    const moderator = api.clientFor(moderatorId, "moderator");
    const { reportId } = await api.clientFor(reporter).safety.report({
      reportedId: reported,
      context: "message",
      contextRef: "m-42",
      reason: "threat",
      details: "Il m'a menacé de venir chez moi.",
    });

    const listed = await moderator.admin.reports({ status: "open", limit: 50 });
    expect(listed.reports[0]?.priority).toBe("p1");
    const detail = await moderator.admin.report({ id: reportId });
    expect(detail).toMatchObject({
      status: "in_review",
      details: "Il m'a menacé de venir chez moi.",
      reportedCard: { held: true, history: { reportsReceived: 1 } },
    });

    await expect(
      moderator.admin.decide({
        reportId,
        decision: { action: "suspension", rule: "respect", statement: "Trop court", durationDays: 7 },
      }),
    ).rejects.toMatchObject({ code: "STATEMENT_REQUIRED" });

    await moderator.admin.decide({
      reportId,
      decision: {
        action: "suspension",
        rule: "respect",
        statement: "Menaces explicites de se rendre au domicile d'un autre membre, dans un message privé.",
        durationDays: 7,
      },
    });
    const [account] = await api.db.select().from(schema.appUser).where(eq(schema.appUser.id, reported));
    expect(account?.status).toBe("suspended");
    const [profile] = await api.db.select().from(schema.profile).where(eq(schema.profile.userId, reported));
    expect(profile?.hiddenAt).toBeNull();
    const [action] = await api.db
      .select()
      .from(schema.moderationAction)
      .where(eq(schema.moderationAction.reportId, reportId));
    expect(action).toMatchObject({ action: "suspension", rule: "respect", moderatorId });
    expect(action?.expiresAt?.toISOString()).toBe("2026-10-09T10:00:00.000Z");

    const decision = api.mailer.sent.find((entry) => entry.to === account?.email);
    expect(decision?.email.text).toContain("Menaces explicites");
    expect(decision?.email.text).toContain("http://app.test/compte/recours");
    const reporterEmail = await emailOf(reporter);
    const handled = api.mailer.sent.find((entry) => entry.to === reporterEmail);
    expect(handled?.email.subject).toBe("Ton signalement a été traité");
    expect(handled?.email.text).not.toContain("suspension");

    await expect(
      moderator.admin.decide({ reportId, decision: { action: "no_action" } }),
    ).rejects.toMatchObject({
      code: "ALREADY_DECIDED",
    });
  });

  it("bans for good and ends the sessions", async () => {
    const reporter = await insertActiveMember(api.db);
    const reported = await insertActiveMember(api.db);
    const moderator = api.clientFor(await insertActiveMember(api.db), "moderator");
    const { reportId } = await api.clientFor(reporter).safety.report({
      reportedId: reported,
      context: "profile",
      reason: "minor",
    });
    await moderator.admin.decide({
      reportId,
      decision: {
        action: "ban",
        rule: "minimum_age",
        statement:
          "Le profil appartient à une personne mineure, ce que les conditions d'utilisation interdisent.",
      },
    });
    const [account] = await api.db.select().from(schema.appUser).where(eq(schema.appUser.id, reported));
    // Sign-in stays possible, to read the statement and appeal (DSA art. 20); the status keeps them out.
    expect(account).toMatchObject({ status: "banned", banned: false });
    expect(api.revokeSessions).toHaveBeenCalledWith(reported);
  });

  it("reveals an identity only with a justification, and logs it", async () => {
    const target = await insertActiveMember(api.db);
    const moderatorId = await insertActiveMember(api.db);
    const moderator = api.clientFor(moderatorId, "moderator");
    const card = await moderator.admin.member({ userId: target });
    expect(JSON.stringify(card)).not.toContain("@");
    const identity = await moderator.admin.revealIdentity({
      userId: target,
      justification: "Réquisition judiciaire n° 2026-118",
    });
    expect(identity).toEqual({ firstName: "Alex", email: await emailOf(target) });
    const log = await moderator.admin.auditLog({ limit: 100 });
    expect(log.entries.find((entry) => entry.action === "identity.revealed")).toMatchObject({
      target: card.member.pseudonym,
      metadata: { justification: "Réquisition judiciaire n° 2026-118" },
    });
  });

  it("lets admins edit the catalogues", async () => {
    const adminClient = api.clientFor(await insertActiveMember(api.db), "admin");
    const created = await adminClient.admin.savePrompt({
      slug: `test-${Date.now()}`,
      category: "campus",
      textFr: "Mon amphi préféré…",
      textEn: "My favourite lecture hall…",
      active: true,
    });
    const updated = await adminClient.admin.savePrompt({ ...created, active: false });
    expect(updated.active).toBe(false);
    await expect(adminClient.admin.savePrompt({ ...created, id: undefined })).rejects.toMatchObject({
      code: "CONFLICT",
    });
  });

  it("lets the member appeal once, reviewed by another moderator who can overturn", async () => {
    const reporter = await insertActiveMember(api.db);
    const reported = await insertActiveMember(api.db);
    const authorId = await insertActiveMember(api.db);
    const author = api.clientFor(authorId, "moderator");
    const reviewer = api.clientFor(await insertActiveMember(api.db), "moderator");
    const { reportId } = await api.clientFor(reporter).safety.report({
      reportedId: reported,
      context: "profile",
      reason: "impersonation",
    });
    await author.admin.decide({
      reportId,
      decision: {
        action: "suspension",
        rule: "authenticity",
        statement:
          "Les photos du profil semblent appartenir à une autre personne, d'après le signalement reçu.",
        durationDays: 30,
      },
    });

    const member = api.clientFor(reported);
    const { decisions } = await member.account.decisions();
    expect(decisions).toHaveLength(1);
    expect(decisions[0]).toMatchObject({ action: "suspension", canAppeal: true, appeal: null });
    const decisionId = decisions[0]?.id ?? "";
    await member.account.appeal({ decisionId, text: "Ce sont bien mes photos, je peux le prouver." });
    await expect(
      member.account.appeal({ decisionId, text: "Je recommence pour être sûr, merci." }),
    ).rejects.toMatchObject({ code: "NOT_ALLOWED" });
    await expect(
      api.clientFor(reporter).account.appeal({ decisionId, text: "Je ne suis pas concerné mais j'essaie." }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    const { appeals } = await reviewer.admin.appeals();
    const pending = appeals.find((item) => item.member?.userId === reported);
    expect(pending).toBeDefined();
    const appealId = pending?.id ?? "";
    expect((await author.admin.appeal({ id: appealId })).canReview).toBe(false);
    await expect(
      author.admin.decideAppeal({
        id: appealId,
        outcome: "upheld",
        statement: "Je maintiens ma propre décision.",
      }),
    ).rejects.toMatchObject({ code: "CONFLICT_OF_INTEREST" });

    await reviewer.admin.decideAppeal({
      id: appealId,
      outcome: "overturned",
      statement: "Les justificatifs fournis montrent que les photos sont bien les tiennes.",
    });
    const [account] = await api.db.select().from(schema.appUser).where(eq(schema.appUser.id, reported));
    expect(account?.status).toBe("active");
    expect((await member.account.decisions()).decisions[0]?.appeal).toBe("overturned");
    const outcome = api.mailer.sent.find((entry) => entry.email.subject === "Ton recours a été accepté");
    expect(outcome?.to).toBe(account?.email);
  });
});
