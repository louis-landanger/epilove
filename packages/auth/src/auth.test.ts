import { emailHmac } from "@atomes/crypto";
import { createDatabase, schema, seedReferenceData } from "@atomes/db";
import { runMigrations } from "@atomes/db/migrations";
import { createMemoryMailer } from "@atomes/email";
import { createMemoryRateLimiter, valkeyFromEnv } from "@atomes/rate-limit";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { authEnvFromProcess } from "./config";
import { createAuth, revokeAllSessions } from "./server";
import { valkeySecondaryStorage } from "./storage";

const url = process.env.DATABASE_URL;

const env = authEnvFromProcess({
  APP_ENV: "test",
  APP_URL: "http://localhost:3000",
  BETTER_AUTH_SECRET: "test-secret-test-secret-test-secret-1234",
  EMAIL_HMAC_SECRET: "test-email-hmac-secret-test-email-hmac-secret",
  PASSKEY_RP_ID: "localhost",
});

async function codeSentTo(mailer: ReturnType<typeof createMemoryMailer>, email: string): Promise<string> {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const message = [...mailer.sent].reverse().find((entry) => entry.to === email);
    const code = message?.email.text.match(/(\d{3}) (\d{3})/);
    if (code) {
      return `${code[1]}${code[2]}`;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`No code sent to ${email}`);
}

/** Needs PostgreSQL (`pnpm services:up`). */
describe.skipIf(!url)("authentication", () => {
  const { db, close } = createDatabase(url ?? "", { maxConnections: 2 });
  const mailer = createMemoryMailer();
  const auth = createAuth({ env, db, mailer, limiter: createMemoryRateLimiter() });
  const email = `test.${Date.now()}@isg.fr`;
  const englishEmail = `test.en.${Date.now()}@ipsa.fr`;

  beforeAll(async () => {
    await runMigrations(db);
    await seedReferenceData(db);
  });

  afterAll(async () => {
    await db.delete(schema.appUser).where(eq(schema.appUser.email, email));
    await db.delete(schema.appUser).where(eq(schema.appUser.email, englishEmail));
    await close();
  });

  it("signs a school address in with a one-time code and creates the member", async () => {
    await auth.api.sendVerificationOTP({ body: { email, type: "sign-in" } });
    const otp = await codeSentTo(mailer, email);
    expect(otp).toMatch(/^\d{6}$/);

    const result = await auth.api.signInEmailOTP({ body: { email, otp } });
    expect(result.token).toBeTruthy();

    const [user] = await db
      .select({
        status: schema.appUser.status,
        locale: schema.appUser.locale,
        emailHmac: schema.appUser.emailHmac,
        schoolId: schema.appUser.schoolId,
      })
      .from(schema.appUser)
      .where(eq(schema.appUser.email, email));
    expect(user?.status).toBe("onboarding");
    expect(user?.locale).toBe("fr");
    expect(user?.emailHmac).toMatch(/^[0-9a-f]{64}$/);
    const [isg] = await db
      .select({ id: schema.school.id })
      .from(schema.school)
      .where(eq(schema.school.slug, "isg"));
    expect(user?.schoolId).toBe(isg?.id);
  });

  it("writes in the page's language and remembers it on the account (PLT-04)", async () => {
    const headers = new Headers({ "x-atomes-locale": "en", "accept-language": "fr-FR" });
    await auth.api.sendVerificationOTP({ body: { email: englishEmail, type: "sign-in" }, headers });
    const otp = await codeSentTo(mailer, englishEmail);
    const message = mailer.sent.find((entry) => entry.to === englishEmail);
    expect(message?.email.subject).toMatch(/is your Atomes code$/);

    const signedIn = await auth.api.signInEmailOTP({
      body: { email: englishEmail, otp },
      headers,
      returnHeaders: true,
    });
    expect(signedIn.headers.get("set-cookie")).toContain("NEXT_LOCALE=en");
    const [user] = await db
      .select({ locale: schema.appUser.locale })
      .from(schema.appUser)
      .where(eq(schema.appUser.email, englishEmail));
    expect(user?.locale).toBe("en");
  });

  it("stores codes hashed, never in clear", async () => {
    await auth.api.sendVerificationOTP({ body: { email, type: "sign-in" } });
    const otp = await codeSentTo(mailer, email);
    const rows = await db.select({ value: schema.authVerification.value }).from(schema.authVerification);
    expect(rows.some((row) => row.value.includes(otp))).toBe(false);
  });

  it("refuses addresses outside the eligible schools", async () => {
    await expect(
      auth.api.sendVerificationOTP({ body: { email: "someone@gmail.com", type: "sign-in" } }),
    ).rejects.toMatchObject({ body: { code: "SCHOOL_EMAIL_REQUIRED" } });
  });

  it("refuses non-canonical addresses (plus addressing, upper case)", async () => {
    await expect(
      auth.api.sendVerificationOTP({ body: { email: "Prenom.Nom+x@epita.fr", type: "sign-in" } }),
    ).rejects.toMatchObject({ body: { code: "EMAIL_NOT_CANONICAL" } });
  });

  it("rejects a wrong code", async () => {
    await auth.api.sendVerificationOTP({ body: { email, type: "sign-in" } });
    await expect(auth.api.signInEmailOTP({ body: { email, otp: "000000" } })).rejects.toBeTruthy();
  });

  it("limits the number of codes per address", async () => {
    const limited = createAuth({ env, db, mailer, limiter: createMemoryRateLimiter() });
    const target = `quota.${Date.now()}@esme.fr`;
    for (let i = 0; i < 5; i += 1) {
      await limited.api.sendVerificationOTP({ body: { email: target, type: "sign-in" } });
    }
    await expect(
      limited.api.sendVerificationOTP({ body: { email: target, type: "sign-in" } }),
    ).rejects.toMatchObject({ body: { code: "OTP_EMAIL_QUOTA" } });
  });

  it("treats a code sign-in during the window as the yearly re-verification", async () => {
    const soon = new Date(Date.now() + 10 * 86_400_000);
    await db
      .update(schema.appUser)
      .set({ reverifyDueAt: soon, status: "paused", pausedForReverification: true })
      .where(eq(schema.appUser.email, email));
    mailer.sent.length = 0;
    await auth.api.sendVerificationOTP({ body: { email, type: "sign-in" } });
    const otp = await codeSentTo(mailer, email);
    await auth.api.signInEmailOTP({ body: { email, otp } });
    const [user] = await db
      .select({
        status: schema.appUser.status,
        due: schema.appUser.reverifyDueAt,
        provenAt: schema.appUser.emailProvenAt,
        flag: schema.appUser.pausedForReverification,
      })
      .from(schema.appUser)
      .where(eq(schema.appUser.email, email));
    expect(user).toMatchObject({ status: "active", flag: false });
    expect(user?.provenAt).toBeInstanceOf(Date);
    expect(user?.due?.getUTCMonth()).toBe(9);
    expect((user?.due?.getTime() ?? 0) > soon.getTime()).toBe(true);
  });

  it("refuses an address blocked after an underage declaration, until the date", async () => {
    const blocked = `minor.${Date.now()}@ipsa.fr`;
    const fingerprint = emailHmac(env.EMAIL_HMAC_SECRET, blocked);
    await db
      .insert(schema.signupBlock)
      .values({ emailHmac: fingerprint, reason: "underage", until: "2999-01-01" });
    await expect(
      auth.api.sendVerificationOTP({ body: { email: blocked, type: "sign-in" } }),
    ).rejects.toMatchObject({ body: { code: "SIGNUP_BLOCKED" } });

    await db
      .update(schema.signupBlock)
      .set({ until: "2000-01-01" })
      .where(eq(schema.signupBlock.emailHmac, fingerprint));
    await expect(
      auth.api.sendVerificationOTP({ body: { email: blocked, type: "sign-in" } }),
    ).resolves.toBeTruthy();
    await db.delete(schema.signupBlock).where(eq(schema.signupBlock.emailHmac, fingerprint));
  });
});

/** ONB-10: no network needed to check what the authorisation request asks for. */
describe.skipIf(!url)("Microsoft sign-in", () => {
  const { db, close } = createDatabase(url ?? "", { maxConnections: 1 });
  afterAll(close);

  it("asks work and school accounts for OpenID Connect claims only", async () => {
    const auth = createAuth({
      env,
      db,
      mailer: createMemoryMailer(),
      limiter: createMemoryRateLimiter(),
      microsoft: {
        clientId: "client-id",
        clientSecret: "client-secret",
        allowedTenants: ["11111111-2222-3333-4444-555555555555"],
      },
    });
    const result = await auth.api.signInSocial({
      body: { provider: "microsoft", callbackURL: "/onboarding" },
    });
    const target = new URL(result.url ?? "");
    expect(target.origin).toBe("https://login.microsoftonline.com");
    expect(target.pathname).toContain("/organizations/");
    expect(target.searchParams.get("scope")?.split(" ").sort()).toEqual(["email", "openid", "profile"]);
  });
});

const valkeyUrl = process.env.VALKEY_URL;

/** Sessions live in Valkey: deleting rows is not enough to sign someone out. */
describe.skipIf(!url || !valkeyUrl)("session revocation", () => {
  // Vitest runs the body of a skipped describe to collect its tests: the
  // connections are only opened once it really runs.
  let database: ReturnType<typeof createDatabase>;
  let valkey: ReturnType<typeof valkeyFromEnv>;
  let auth: ReturnType<typeof createAuth>;
  const mailer = createMemoryMailer();
  const email = `revoke.${Date.now()}@epita.fr`;

  beforeAll(async () => {
    database = createDatabase(url ?? "", { maxConnections: 2 });
    valkey = valkeyFromEnv({ VALKEY_URL: valkeyUrl });
    auth = createAuth({
      env,
      db: database.db,
      mailer,
      limiter: createMemoryRateLimiter(),
      secondaryStorage: valkeySecondaryStorage(valkey),
    });
    await runMigrations(database.db);
    await seedReferenceData(database.db);
  });

  afterAll(async () => {
    await database.db.delete(schema.appUser).where(eq(schema.appUser.email, email));
    valkey.disconnect();
    await database.close();
  });

  it("ends every session of a member at once", async () => {
    const tokens: string[] = [];
    for (let i = 0; i < 2; i += 1) {
      await auth.api.sendVerificationOTP({ body: { email, type: "sign-in" } });
      const otp = await codeSentTo(mailer, email);
      mailer.sent.length = 0;
      const result = await auth.api.signInEmailOTP({ body: { email, otp } });
      tokens.push(result.token);
    }
    const cookieSession = async (token: string) => {
      const context = await auth.$context;
      return context.internalAdapter.findSession(token);
    };
    expect(await cookieSession(tokens[0] ?? "")).toBeTruthy();
    const [user] = await database.db
      .select({ id: schema.appUser.id })
      .from(schema.appUser)
      .where(eq(schema.appUser.email, email));

    await revokeAllSessions(auth, user?.id ?? "");

    for (const token of tokens) {
      expect(await cookieSession(token)).toBeNull();
    }
  });
});
