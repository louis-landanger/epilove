import { createDatabase, schema } from "@epilove/db";
import { cleanupTestMembers, createTestMember, prepareTestDatabase } from "@epilove/db/testing";
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
    { name: "epilove_dev_user", value: memberId, url: baseURL ?? "http://127.0.0.1:3100" },
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
