import { randomUUID } from "node:crypto";
import { REFERRAL_CODE_PATTERN } from "@atomes/contracts";
import { createApiClient } from "@atomes/contracts/client";
import { emailHmac } from "@atomes/crypto";
import { createDatabase, deleteWaitlistEntries, findWaitlistEntry } from "@atomes/db";
import { createMemoryMailer } from "@atomes/email";
import { call } from "@orpc/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp, defaultServices } from "../app";
import { type ApiContext, anonymous } from "../context";
import { createWaitlistProcedures, generateReferralCode } from "./waitlist";

describe("generateReferralCode", () => {
  it("draws 10 lowercase Crockford base32 symbols", () => {
    for (let index = 0; index < 200; index += 1) {
      expect(generateReferralCode()).toMatch(REFERRAL_CODE_PATTERN);
    }
  });

  it("maps every byte uniformly onto the alphabet", () => {
    const draw = [0, 31, 32, 255, 10, 17, 18, 20, 22, 27];
    const code = generateReferralCode((bytes) => bytes.map((_, index) => draw[index] ?? 0));
    // 0→0, 31→z, 32→0, 255→z, 10→a, 17→h, 18→j (no i), 20→m (no l), 22→p (no o), 27→v (no u).
    expect(code).toBe("0z0zahjmpv");
  });

  it("does not repeat itself", () => {
    const codes = new Set(Array.from({ length: 5000 }, () => generateReferralCode()));
    expect(codes.size).toBe(5000);
  });
});

const url = process.env.DATABASE_URL;
const SECRET = "test-only-waitlist-hmac-secret-0123456789";

/** Needs PostgreSQL with the reference data (`pnpm services:up`, `pnpm db:migrate`, `pnpm db:seed`). */
describe.skipIf(!url)("waitlist procedures (PostgreSQL)", () => {
  const { db, close } = createDatabase(url ?? "", { maxConnections: 4 });
  const context: ApiContext = {
    version: "test",
    database: () => db,
    viewer: null,
    services: defaultServices({}),
  };
  const createdHmacs: string[] = [];
  const unique = () => randomUUID().slice(0, 8);

  function setup() {
    const mailer = createMemoryMailer();
    const pending: Promise<void>[] = [];
    const procedures = createWaitlistProcedures({
      hmacSecret: () => SECRET,
      siteUrl: () => "https://atomes.test",
      mailer: () => mailer,
      runInBackground: (task) => {
        pending.push(task());
      },
    });
    return { mailer, procedures, settle: () => Promise.all(pending) };
  }

  function track(address: string): string {
    const hmac = emailHmac(SECRET, address);
    createdHmacs.push(hmac);
    return hmac;
  }

  afterAll(async () => {
    await deleteWaitlistEntries(db, createdHmacs);
    await close();
  });

  it("stores only the HMAC, then sends the welcome email with the referral link once", async () => {
    const { mailer, procedures, settle } = setup();
    const address = `waitlist.${unique()}@isg.fr`;
    const hmac = track(address);

    await expect(call(procedures.join, { email: address }, { context })).resolves.toEqual({ ok: true });
    await settle();

    const row = await findWaitlistEntry(db, hmac);
    expect(row?.referralCode).toMatch(REFERRAL_CODE_PATTERN);
    expect(JSON.stringify(row)).not.toContain(address.split("@")[0]);

    expect(mailer.sent).toHaveLength(1);
    expect(mailer.sent[0]?.to).toBe(address);
    expect(mailer.sent[0]?.email.subject).toBe("Tu es sur la liste d'attente");
    expect(mailer.sent[0]?.email.text).toContain(`https://atomes.test/?r=${row?.referralCode}`);
    expect(mailer.sent[0]?.email.text).toContain("ISG");
  });

  it("is idempotent and answers the same whether the address is known or not", async () => {
    const { mailer, procedures, settle } = setup();
    const address = `waitlist.${unique()}@epita.fr`;
    const hmac = track(address);

    const first = await call(procedures.join, { email: address }, { context });
    // Same mailbox: other case and a `+tag` (see parseSchoolEmail).
    const second = await call(
      procedures.join,
      { email: address.replace("@", "+promo@").toUpperCase() },
      { context },
    );
    const concurrent = await Promise.all(
      Array.from({ length: 3 }, () => call(procedures.join, { email: address }, { context })),
    );
    await settle();

    expect(second).toEqual(first);
    expect(concurrent).toEqual([first, first, first]);
    expect(await deleteWaitlistEntries(db, [hmac])).toBe(1);
    expect(mailer.sent).toHaveLength(1);
  });

  it("records who referred whom and ignores unknown codes", async () => {
    const { procedures, settle } = setup();
    const referrer = `parrain.${unique()}@esme.fr`;
    const referrerHmac = track(referrer);
    await call(procedures.join, { email: referrer }, { context });
    const referrerRow = await findWaitlistEntry(db, referrerHmac);

    const referred = `filleul.${unique()}@ipsa.fr`;
    const referredHmac = track(referred);
    await call(procedures.join, { email: referred, referralCode: referrerRow?.referralCode }, { context });

    const stranger = `inconnu.${unique()}@supbiotech.fr`;
    const strangerHmac = track(stranger);
    await call(procedures.join, { email: stranger, referralCode: "0000000000" }, { context });
    await settle();

    expect((await findWaitlistEntry(db, referredHmac))?.referredBy).toBe(referrerRow?.id);
    expect((await findWaitlistEntry(db, strangerHmac))?.referredBy).toBeNull();
  });

  it("refuses malformed and non-eligible addresses without touching the database", async () => {
    const { mailer, procedures } = setup();
    await expect(call(procedures.join, { email: "pas-une-adresse" }, { context })).resolves.toEqual({
      ok: false,
      reason: "invalid_format",
    });
    await expect(call(procedures.join, { email: "quelquun@gmail.com" }, { context })).resolves.toEqual({
      ok: false,
      reason: "domain_not_allowed",
    });
    await expect(
      call(procedures.join, { email: "x@isg.fr", referralCode: "NOT-A-CODE" }, { context }),
    ).rejects.toThrow();
    expect(mailer.sent).toHaveLength(0);
  });

  it("limits repeated attempts for the same address", async () => {
    const { procedures } = setup();
    const address = `insistant.${unique()}@isg.fr`;
    track(address);
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await call(procedures.join, { email: address }, { context });
    }
    await expect(call(procedures.join, { email: address }, { context })).rejects.toMatchObject({
      code: "TOO_MANY_REQUESTS",
    });
  });

  it("ranks the schools by share of their headcount", async () => {
    const before = await call(setup().procedures.stats, undefined, { context });
    const { procedures, settle } = setup();
    for (const domain of ["ipsa.fr", "ipsa.fr", "isg.fr"]) {
      const address = `course.${unique()}@${domain}`;
      track(address);
      await call(procedures.join, { email: address }, { context });
    }
    await settle();
    const after = await call(setup().procedures.stats, undefined, { context });

    expect(after.total - before.total).toBeGreaterThanOrEqual(3);
    expect(after.schools.map((entry) => entry.slug).sort()).toEqual([
      "epita",
      "esme",
      "ipsa",
      "isg",
      "supbiotech",
    ]);
    const ipsa = after.schools.find((entry) => entry.slug === "ipsa");
    const ipsaBefore = before.schools.find((entry) => entry.slug === "ipsa");
    expect((ipsa?.count ?? 0) - (ipsaBefore?.count ?? 0)).toBeGreaterThanOrEqual(2);
    expect(ipsa?.name).toBe("IPSA");
    expect(ipsa?.share).toBeCloseTo((ipsa?.count ?? 0) / (ipsa?.headcount ?? 1), 10);
    for (let index = 1; index < after.schools.length; index += 1) {
      expect(after.schools[index - 1]?.share ?? 0).toBeGreaterThanOrEqual(after.schools[index]?.share ?? 0);
    }
    expect(after.goal).toBe(1000);
    expect(after.goalRatio).toBeCloseTo(Math.min(1, after.total / after.goal), 10);
  });
});

const smtpUrl = process.env.SMTP_URL;
const mailpitUrl = process.env.MAILPIT_URL ?? "http://localhost:8025";

/** End to end through HTTP, the router and SMTP: needs PostgreSQL and Mailpit. */
describe.skipIf(!url || !smtpUrl)("waitlist over HTTP", () => {
  const { db, close } = createDatabase(url ?? "", { maxConnections: 2 });
  const hmacs: string[] = [];
  let client: ReturnType<typeof createApiClient>;

  beforeAll(() => {
    process.env.EMAIL_HMAC_SECRET ??= SECRET;
    process.env.SITE_URL ??= "http://localhost:3000";
    const app = createApp({ version: "test", database: () => db, resolveViewer: anonymous });
    client = createApiClient({
      url: "http://localhost/api/rpc",
      fetch: (request) => Promise.resolve(app.fetch(request)),
    });
  });

  afterAll(async () => {
    await deleteWaitlistEntries(db, hmacs);
    await close();
  });

  it("joins, delivers the welcome email and counts the new entry", async () => {
    const address = `http.${randomUUID().slice(0, 8)}@supbiotech.fr`;
    hmacs.push(emailHmac(process.env.EMAIL_HMAC_SECRET ?? SECRET, address));

    await expect(client.waitlist.join({ email: address })).resolves.toEqual({ ok: true });
    await expect(client.waitlist.join({ email: address })).resolves.toEqual({ ok: true });

    let subjects: string[] = [];
    for (let attempt = 0; attempt < 50 && subjects.length === 0; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      const response = await fetch(
        `${mailpitUrl}/api/v1/search?query=${encodeURIComponent(`to:${address}`)}`,
      );
      const body = (await response.json()) as { messages: Array<{ Subject: string }> };
      subjects = body.messages.map((message) => message.Subject);
    }
    expect(subjects).toEqual(["Tu es sur la liste d'attente"]);

    const stats = await client.waitlist.stats();
    expect(stats.schools.find((entry) => entry.slug === "supbiotech")?.count).toBeGreaterThanOrEqual(1);
  });
});
