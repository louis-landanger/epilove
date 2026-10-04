import { createDatabase, schema } from "@atomes/db";
import { cleanupTestMembers, createTestMember, prepareTestDatabase } from "@atomes/db/testing";
import AxeBuilder from "@axe-core/playwright";
import { type Browser, expect, type Page, test } from "@playwright/test";
import { and, eq } from "drizzle-orm";

/**
 * Block, report and unmatch (SAF-01, SAF-02, CHAT-13) from a profile and a
 * conversation, with the design system dialogs shared by the whole app.
 */
const url = process.env.DATABASE_URL;
const { db, close } = createDatabase(url ?? "postgres://invalid", { maxConnections: 2 });
const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

test.skip(!url, "Needs DATABASE_URL and the local services (pnpm services:up).");
test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  await prepareTestDatabase(db);
});
test.afterAll(async () => {
  await cleanupTestMembers(db);
  await close();
});

async function signIn(browser: Browser, memberId: string, baseURL: string | undefined): Promise<Page> {
  const context = await browser.newContext();
  await context.addCookies([
    { name: "atomes_dev_user", value: memberId, url: baseURL ?? "http://127.0.0.1:3100" },
  ]);
  return context.newPage();
}

test("reports then blocks someone from their profile", async ({ browser, baseURL }) => {
  const nour = await createTestMember(db, {
    firstName: "Nour",
    gender: "woman",
    interestedIn: ["man"],
    graduationYear: 2039,
  });
  const teo = await createTestMember(db, {
    firstName: "Téo",
    gender: "man",
    interestedIn: ["woman"],
    graduationYear: 2039,
  });
  const page = await signIn(browser, nour, baseURL);
  await page.goto(`/membres/${teo}`);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Téo");

  await page.getByRole("button", { name: "Plus d'options" }).click();
  await page.getByRole("menuitem", { name: "Signaler" }).click();
  const report = page.getByRole("dialog", { name: "Signaler Téo" });
  await expect(report.getByText("Si tu es en danger, appelle le 17 ou le 112.")).toBeVisible();
  expect((await new AxeBuilder({ page }).withTags(WCAG).analyze()).violations.map((v) => v.id)).toEqual([]);
  await report.getByRole("radio", { name: "Spam ou arnaque" }).check();
  await report.getByRole("checkbox", { name: "Bloquer aussi cette personne" }).uncheck();
  await report.getByRole("button", { name: "Envoyer le signalement" }).click();
  await expect(page.getByText("Signalement envoyé. Merci, on s'en occupe.")).toBeVisible();
  await expect(report).toBeHidden();
  const reports = await db
    .select({ context: schema.report.context, reason: schema.report.reason })
    .from(schema.report)
    .where(and(eq(schema.report.reporterId, nour), eq(schema.report.reportedId, teo)));
  expect(reports).toEqual([{ context: "profile", reason: "spam" }]);

  // Not blocked by the report: the profile is still there, and can be blocked.
  await page.getByRole("button", { name: "Plus d'options" }).click();
  await page.getByRole("menuitem", { name: "Bloquer" }).click();
  const block = page.getByRole("dialog", { name: "Bloquer Téo ?" });
  await block.getByRole("button", { name: "Bloquer" }).click();
  await page.waitForURL(/\/decouvrir$/);
  const blocks = await db
    .select()
    .from(schema.block)
    .where(and(eq(schema.block.blockerId, nour), eq(schema.block.blockedId, teo)));
  expect(blocks).toHaveLength(1);
});

test("reports a message, then unmatches from the conversation", async ({ browser, baseURL }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Two-browser scenario runs once.");
  const ines = await createTestMember(db, { firstName: "Inès", graduationYear: 2039 });
  const malo = await createTestMember(db, { firstName: "Malo", graduationYear: 2039 });
  const [userLow, userHigh] = ines < malo ? [ines, malo] : [malo, ines];
  const [created] = await db
    .insert(schema.match)
    .values({ userLow, userHigh, mode: "friends", source: "like" })
    .returning({ id: schema.match.id });
  const matchId = created?.id ?? "";
  const inesPage = await signIn(browser, ines, baseURL);
  const maloPage = await signIn(browser, malo, baseURL);
  await maloPage.goto(`/messages/${matchId}`);
  await maloPage.getByRole("textbox", { name: "Écrire à Inès" }).fill("Message à signaler");
  await maloPage.keyboard.press("Enter");

  await inesPage.goto(`/messages/${matchId}`);
  const message = inesPage
    .getByRole("list", { name: "Messages" })
    .locator("li", { hasText: "Message à signaler" });
  await expect(message).toBeVisible({ timeout: 10_000 });
  await message.getByRole("button", { name: "Actions sur le message" }).click();
  await message.getByRole("button", { name: "Signaler ce message" }).click();
  const report = inesPage.getByRole("dialog", { name: "Signaler Malo" });
  await report.getByRole("radio", { name: "Harcèlement ou insultes" }).check();
  await report.getByRole("checkbox", { name: "Bloquer aussi cette personne" }).uncheck();
  await report.getByRole("button", { name: "Envoyer le signalement" }).click();
  await expect(inesPage.getByText("Signalement envoyé. Merci, on s'en occupe.")).toBeVisible();
  const [reported] = await db
    .select({ context: schema.report.context, contextRef: schema.report.contextRef })
    .from(schema.report)
    .where(and(eq(schema.report.reporterId, ines), eq(schema.report.reportedId, malo)));
  expect(reported?.context).toBe("message");
  expect(reported?.contextRef).toMatch(/^[0-9a-f-]{36}$/);

  await inesPage.getByRole("button", { name: "Plus d'options" }).click();
  await inesPage.getByRole("menuitem", { name: "Annuler le match" }).click();
  const unmatch = inesPage.getByRole("dialog", { name: "Annuler le match avec Malo ?" });
  await expect(unmatch.getByText("La conversation sera fermée pour vous deux.")).toBeVisible();
  await unmatch.getByRole("button", { name: "Annuler le match" }).click();
  await inesPage.waitForURL(/\/messages$/);
  const [ended] = await db
    .select({ status: schema.match.status })
    .from(schema.match)
    .where(eq(schema.match.id, matchId));
  expect(ended?.status).not.toBe("active");
});
