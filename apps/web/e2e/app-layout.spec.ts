import { createDatabase, schema } from "@atomes/db";
import { cleanupTestMembers, createTestMember, prepareTestDatabase } from "@atomes/db/testing";
import { type Browser, expect, type Page, test } from "@playwright/test";

/**
 * The bottom tab bar of the app shell never covers the actions of a screen:
 * full-screen flows (a profile, a conversation, the questionnaire) hide it on
 * phones. Playwright refuses to click an element covered by another one.
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
    { name: "atomes_dev_user", value: memberId, url: baseURL ?? "http://127.0.0.1:3100" },
  ]);
  return context.newPage();
}

test("profile, conversation and questionnaire actions stay reachable", async ({ browser, baseURL }) => {
  const lou = await createTestMember(db, {
    firstName: "Lou",
    gender: "woman",
    interestedIn: ["man"],
    graduationYear: 2039,
  });
  const sacha = await createTestMember(db, {
    firstName: "Sacha",
    gender: "man",
    interestedIn: ["woman"],
    graduationYear: 2039,
  });
  const noa = await createTestMember(db, { firstName: "Noa", graduationYear: 2039 });
  const [userLow, userHigh] = lou < noa ? [lou, noa] : [noa, lou];
  const [created] = await db
    .insert(schema.match)
    .values({ userLow, userHigh, mode: "friends", source: "like" })
    .returning({ id: schema.match.id });
  const page = await signIn(browser, lou, baseURL);
  const tabs = page.getByRole("navigation", { name: "Navigation principale" });

  await page.goto("/decouvrir");
  await expect(tabs.getByRole("link", { name: "Messages" })).toBeVisible();

  await page.goto(`/membres/${sacha}`);
  await page.getByRole("button", { name: "Liker", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");

  await page.goto(`/messages/${created?.id}`);
  await page.getByRole("textbox", { name: "Écrire à Noa" }).click();
  await page.keyboard.type("On se voit au foyer ?");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("list", { name: "Messages" }).getByText("On se voit au foyer ?")).toBeVisible();

  await page.goto("/campus/questionnaire");
  await page.getByRole("button", { name: "Commencer" }).click();
  await page.getByRole("button", { name: "Passer", exact: true }).click();
  await page.getByRole("button", { name: "Précédent" }).click();
});

test("the Messages tab counts unread conversations, live", async ({ browser, baseURL }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Two-browser scenario runs once.");
  const ines = await createTestMember(db, { firstName: "Inès", graduationYear: 2039 });
  const malo = await createTestMember(db, { firstName: "Malo", graduationYear: 2039 });
  const [userLow, userHigh] = ines < malo ? [ines, malo] : [malo, ines];
  const [created] = await db
    .insert(schema.match)
    .values({ userLow, userHigh, mode: "friends", source: "like" })
    .returning({ id: schema.match.id });
  const inesPage = await signIn(browser, ines, baseURL);
  const maloPage = await signIn(browser, malo, baseURL);
  await inesPage.goto("/decouvrir");
  const messagesTab = inesPage
    .getByRole("navigation", { name: "Navigation principale" })
    .getByRole("link", { name: /^Messages/ })
    .filter({ visible: true });
  await expect(messagesTab).not.toContainText("non lu");

  await maloPage.goto(`/messages/${created?.id}`);
  await maloPage.getByRole("textbox", { name: "Écrire à Inès" }).fill("Tu passes au foyer ?");
  await maloPage.keyboard.press("Enter");
  await expect(messagesTab).toContainText("1 non lu", { timeout: 10_000 });

  // Reading the conversation clears the badge.
  await messagesTab.click();
  await inesPage.getByRole("link", { name: /Malo/ }).first().click();
  await expect(
    inesPage.getByRole("list", { name: "Messages" }).getByText("Tu passes au foyer ?"),
  ).toBeVisible();
  await expect(messagesTab).not.toContainText("non lu", { timeout: 10_000 });
});
