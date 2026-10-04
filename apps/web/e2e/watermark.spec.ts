import { createDatabase } from "@atomes/db";
import { cleanupTestMembers, createTestMember, prepareTestDatabase } from "@atomes/db/testing";
import { type Browser, expect, type Page, test } from "@playwright/test";

/**
 * Dynamic watermark (SAF-12): the photos of other members carry the viewer's
 * own code, so that a shared screenshot says whose screen it came from.
 */
const url = process.env.DATABASE_URL;
const { db, close } = createDatabase(url ?? "postgres://invalid", { maxConnections: 2 });
const CODE = /^[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/;

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

async function codesOn(page: Page): Promise<string[]> {
  const marks = page.locator("main svg[data-watermark]");
  await expect(marks.first()).toBeAttached();
  return marks.evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-watermark") ?? ""));
}

test("photos of other members carry the viewer's code", async ({ browser, baseURL }) => {
  const ana = await createTestMember(db, {
    firstName: "Ana",
    gender: "woman",
    interestedIn: ["man"],
    graduationYear: 2039,
  });
  const ewen = await createTestMember(db, {
    firstName: "Ewen",
    gender: "man",
    interestedIn: ["woman"],
    graduationYear: 2039,
  });
  const lise = await createTestMember(db, {
    firstName: "Lise",
    gender: "woman",
    interestedIn: ["man"],
    graduationYear: 2039,
  });
  const anaPage = await signIn(browser, ana, baseURL);
  const lisePage = await signIn(browser, lise, baseURL);

  await anaPage.goto(`/membres/${ewen}`);
  const anaCodes = await codesOn(anaPage);
  expect(anaCodes.length).toBeGreaterThan(0);
  expect(new Set(anaCodes).size).toBe(1);
  expect(anaCodes[0]).toMatch(CODE);

  await lisePage.goto(`/membres/${ewen}`);
  const liseCodes = await codesOn(lisePage);
  expect(liseCodes[0]).toMatch(CODE);
  expect(liseCodes[0]).not.toBe(anaCodes[0]);

  // Ewen likes Ana: his photo in her likes carries her code too.
  const ewenPage = await signIn(browser, ewen, baseURL);
  await ewenPage.goto(`/membres/${ana}`);
  await ewenPage.getByRole("button", { name: "Liker", exact: true }).click();
  await ewenPage.getByRole("button", { name: "Envoyer le like" }).click();
  await expect(ewenPage.getByText("Like envoyé")).toBeVisible();
  await anaPage.goto("/likes");
  expect(await codesOn(anaPage)).toContain(anaCodes[0]);
});
