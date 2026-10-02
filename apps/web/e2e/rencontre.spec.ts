import AxeBuilder from "@axe-core/playwright";
import { createDatabase } from "@epilove/db";
import { cleanupTestMembers, createTestMember, prepareTestDatabase } from "@epilove/db/testing";
import { type Browser, expect, type Page, test } from "@playwright/test";

/**
 * Dating flows with two browsers (session B): like, match, realtime chat.
 * Members are created directly in the database so that the scenario does not
 * depend on the development data set.
 */
const url = process.env.DATABASE_URL;
const { db, close } = createDatabase(url ?? "postgres://invalid", { maxConnections: 2 });

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
    { name: "epilove-dev-member", value: memberId, url: baseURL ?? "http://127.0.0.1:3100" },
  ]);
  return context.newPage();
}

const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

test("two members like each other, match and chat in real time", async ({ browser, baseURL }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Two-browser scenario runs once.");
  const alix = await createTestMember(db, {
    firstName: "Alix",
    gender: "woman",
    interestedIn: ["man"],
    graduationYear: 2039,
  });
  const bao = await createTestMember(db, {
    firstName: "Bao",
    gender: "man",
    interestedIn: ["woman"],
    graduationYear: 2039,
  });
  const alixPage = await signIn(browser, alix, baseURL);
  const baoPage = await signIn(browser, bao, baseURL);

  // Alix likes Bao's photo from his profile, with a comment.
  await alixPage.goto(`/membres/${bao}`);
  await expect(alixPage.getByRole("heading", { level: 1 })).toContainText("Bao");
  await alixPage.getByRole("button", { name: "Liker", exact: true }).click();
  await alixPage.getByLabel("Un mot pour engager la conversation").fill("Salut Bao !");
  await alixPage.getByRole("button", { name: "Envoyer le like" }).click();
  await expect(alixPage.getByText("Like envoyé")).toBeVisible();

  // Bao sees the like, with its comment, and likes back: it's a match.
  await baoPage.goto("/likes");
  await expect(baoPage.getByText("« Salut Bao ! »")).toBeVisible();
  await baoPage.getByRole("button", { name: "Liker en retour" }).click();
  const liaison = baoPage.getByRole("dialog");
  await expect(liaison.getByRole("heading")).toContainText("établie");
  await liaison.getByRole("link", { name: "Écrire à Alix" }).click();
  await baoPage.waitForURL(/\/messages\/[0-9a-f-]{36}$/);
  const conversation = baoPage.url();

  // Both open the conversation; messages arrive live in both directions.
  await alixPage.goto(new URL(conversation).pathname);
  const alixMessages = alixPage.getByRole("list", { name: "Messages" });
  const baoMessages = baoPage.getByRole("list", { name: "Messages" });
  await baoPage.getByRole("textbox", { name: "Écrire à Alix" }).fill("Merci pour le like 😊");
  await baoPage.keyboard.press("Enter");
  await expect(alixMessages.getByText("Merci pour le like 😊")).toBeVisible({ timeout: 10_000 });

  await alixPage.getByRole("textbox", { name: "Écrire à Bao" }).fill("Escalade samedi ?");
  await alixPage.keyboard.press("Enter");
  await expect(baoMessages.getByText("Escalade samedi ?")).toBeVisible({ timeout: 10_000 });

  // Read receipt: Bao has the conversation open, so Alix eventually sees "Vu".
  await expect(alixPage.getByText("Vu")).toBeVisible({ timeout: 10_000 });

  const results = await new AxeBuilder({ page: alixPage }).withTags(WCAG).analyze();
  expect(results.violations).toEqual([]);
});

test("the discovery, likes and messages screens have no detectable accessibility violations", async ({
  browser,
  baseURL,
}) => {
  const member = await createTestMember(db, { firstName: "Cyan", graduationYear: 2039 });
  const page = await signIn(browser, member, baseURL);
  for (const path of [
    "/decouvrir",
    "/likes",
    "/messages",
    "/campus/questionnaire",
    "/notifications",
    "/reglages/notifications",
  ]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
    const results = await new AxeBuilder({ page }).withTags(WCAG).analyze();
    expect(results.violations, path).toEqual([]);
  }
});

test("pages ask to sign in without a member", async ({ page }) => {
  await page.goto("/decouvrir");
  await expect(page.getByRole("heading", { name: "Connecte-toi pour continuer" })).toBeVisible();
});

test("serves the service worker with push handling", async ({ request }) => {
  const response = await request.get("/serwist/sw.js");
  expect(response.ok()).toBe(true);
  expect(response.headers()["content-type"]).toContain("javascript");
  expect(await response.text()).toContain("showNotification");
});
