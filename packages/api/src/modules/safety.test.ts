import { decryptText } from "@epilove/crypto";
import { schema } from "@epilove/db";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestApi, insertActiveMember, TEST_KEY_RING } from "../test-support";

const url = process.env.DATABASE_URL;

/** Needs a disposable PostgreSQL (`pnpm services:up` locally, a service container in CI). */
describe.skipIf(!url)("safety, privacy and account", () => {
  const api = createTestApi(url ?? "");
  beforeAll(api.prepare);
  afterAll(api.close);

  const heldAt = async (userId: string) => {
    const [row] = await api.db
      .select({ hiddenAt: schema.profile.hiddenAt })
      .from(schema.profile)
      .where(eq(schema.profile.userId, userId));
    return row?.hiddenAt ?? null;
  };

  it("blocks silently and idempotently, and unblocks", async () => {
    const me = await insertActiveMember(api.db);
    const other = await insertActiveMember(api.db);
    const client = api.clientFor(me);

    await expect(client.safety.block({ userId: other })).resolves.toEqual({ ok: true });
    await expect(client.safety.block({ userId: other })).resolves.toEqual({ ok: true });
    const { people } = await client.safety.blocked();
    expect(people).toEqual([{ userId: other, firstName: "Alex", blockedAt: expect.any(String) }]);

    await expect(client.safety.block({ userId: me })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      client.safety.block({ userId: "01920000-0000-7000-8000-00000000dead" }),
    ).rejects.toMatchObject({
      code: "NOT_FOUND",
    });

    await client.safety.unblock({ userId: other });
    expect((await client.safety.blocked()).people).toEqual([]);
  });

  it("files encrypted, deduplicated reports, blocking by default", async () => {
    const me = await insertActiveMember(api.db);
    const other = await insertActiveMember(api.db);
    const client = api.clientFor(me);

    const input = {
      reportedId: other,
      context: "profile" as const,
      reason: "spam" as const,
      details: "Pub pour un compte Instagram",
    };
    const { reportId } = await client.safety.report(input);
    expect((await client.safety.report(input)).reportId).toBe(reportId);

    const [row] = await api.db.select().from(schema.report).where(eq(schema.report.id, reportId));
    expect(row).toMatchObject({ priority: "p3", status: "open", reporterId: me, keyId: "test" });
    expect(Buffer.from(row?.detailsEncrypted ?? []).toString("utf8")).not.toContain("Instagram");
    expect(
      decryptText(TEST_KEY_RING, {
        keyId: row?.keyId ?? "",
        data: row?.detailsEncrypted ?? new Uint8Array(),
      }),
    ).toBe("Pub pour un compte Instagram");

    const blocks = await api.db
      .select()
      .from(schema.block)
      .where(and(eq(schema.block.blockerId, me), eq(schema.block.blockedId, other)));
    expect(blocks).toHaveLength(1);
    expect(await heldAt(other)).toBeNull();
  });

  it("hides a profile at once for P1 and after two independent P2 reports", async () => {
    const threatened = await insertActiveMember(api.db);
    const author = await insertActiveMember(api.db);
    await api
      .clientFor(threatened)
      .safety.report({ reportedId: author, context: "message", reason: "threat" });
    expect(await heldAt(author)).not.toBeNull();
    const [audit] = await api.db
      .select({ action: schema.auditLog.action, metadata: schema.auditLog.metadata })
      .from(schema.auditLog)
      .where(eq(schema.auditLog.targetId, author));
    expect(audit?.action).toBe("profile.held");

    const target = await insertActiveMember(api.db);
    const first = await insertActiveMember(api.db);
    const second = await insertActiveMember(api.db);
    await api
      .clientFor(first)
      .safety.report({ reportedId: target, context: "profile", reason: "harassment" });
    expect(await heldAt(target)).toBeNull();
    // The same person reporting twice does not count as two.
    await api
      .clientFor(first)
      .safety.report({ reportedId: target, context: "message", contextRef: "m1", reason: "harassment" });
    expect(await heldAt(target)).toBeNull();
    await api.clientFor(second).safety.report({ reportedId: target, context: "profile", reason: "hate" });
    expect(await heldAt(target)).not.toBeNull();
  });

  it("hides contacts by fingerprint only and manages privacy settings", async () => {
    const me = await insertActiveMember(api.db);
    const client = api.clientFor(me);

    const { contacts } = await client.preferences.hideContact({ email: "Ex.Copine+tag@ESME.fr" });
    expect(contacts).toEqual([
      { id: expect.any(String), hint: "ex…@esme.fr", createdAt: expect.any(String) },
    ]);
    expect((await client.preferences.hideContact({ email: "ex.copine@esme.fr" })).contacts).toHaveLength(1);
    const [stored] = await api.db
      .select()
      .from(schema.hiddenContact)
      .where(eq(schema.hiddenContact.userId, me));
    expect(JSON.stringify(stored)).not.toContain("copine");
    await expect(client.preferences.hideContact({ email: "someone@gmail.com" })).rejects.toMatchObject({
      code: "INVALID_VALUE",
    });
    expect((await client.preferences.unhideContact({ id: contacts[0]?.id ?? "" })).contacts).toEqual([]);

    const updated = await client.preferences.update({
      hideFromOwnYear: true,
      discreetNotifications: false,
      ageMax: 30,
    });
    expect(updated).toMatchObject({
      hideFromOwnYear: true,
      discreetNotifications: false,
      ageMin: 18,
      ageMax: 30,
    });
    await expect(client.preferences.update({ ageMin: 40, ageMax: 30 })).rejects.toMatchObject({
      code: "INVALID_VALUE",
    });

    // Love mode with consent, then withdrawal: genders erased, Friends only.
    const love = await client.preferences.setModes({
      modes: ["love", "friends"],
      sensitiveConsent: true,
      interestedIn: ["woman"],
    });
    expect(love).toMatchObject({
      modes: ["love", "friends"],
      sensitiveConsent: true,
      interestedIn: ["woman"],
    });
    const withdrawn = await client.preferences.setModes({
      modes: ["love", "friends"],
      sensitiveConsent: false,
      interestedIn: ["woman"],
    });
    expect(withdrawn).toMatchObject({ modes: ["friends"], sensitiveConsent: false, interestedIn: [] });
    const [prefs] = await api.db.select().from(schema.preferences).where(eq(schema.preferences.userId, me));
    expect(prefs?.interestedIn).toEqual([]);
  });

  it("pauses, resumes and deletes the account", async () => {
    const me = await insertActiveMember(api.db);
    const client = api.clientFor(me);

    expect((await client.account.pause()).status).toBe("paused");
    expect((await client.account.pause()).status).toBe("paused");
    expect((await client.account.resume()).status).toBe("active");

    await expect(client.account.delete({ confirm: true })).resolves.toEqual({ ok: true });
    expect(api.revokeSessions).toHaveBeenCalledWith(me);
    const [account] = await api.db.select().from(schema.appUser).where(eq(schema.appUser.id, me));
    expect(account?.status).toBe("deleting");
    const [vault] = await api.db
      .select()
      .from(schema.identityVault)
      .where(eq(schema.identityVault.formerUserId, me));
    expect(vault).toMatchObject({ email: account?.email, firstName: "Alex", birthDate: "2003-02-10" });
    expect(vault?.purgeAfter.getUTCFullYear()).toBe(2031);
    await expect(client.account.delete({ confirm: true })).rejects.toMatchObject({ code: "NOT_ALLOWED" });
    await expect(client.account.pause()).rejects.toMatchObject({ code: "NOT_ALLOWED" });
  });
});
