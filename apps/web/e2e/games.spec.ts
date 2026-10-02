import AxeBuilder from "@axe-core/playwright";
import { createDatabase, schema } from "@epilove/db";
import { cleanupTestMembers, createTestMember, prepareTestDatabase } from "@epilove/db/testing";
import { type Browser, expect, type Page, test } from "@playwright/test";

/** Mini-games (CHAT-11): two members play « Tu préfères » in real time. */
const url = process.env.DATABASE_URL;
const { db, close } = createDatabase(url ?? "postgres://invalid", { maxConnections: 2 });
const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

test.skip(!url, "Needs DATABASE_URL and the local services (pnpm services:up).");

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

test("two members play « Tu préfères » and see both answers at the end", async ({
  browser,
  baseURL,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Two-browser scenario runs once.");
  const zoe = await createTestMember(db, { firstName: "Zoé", graduationYear: 2039 });
  const yan = await createTestMember(db, { firstName: "Yan", graduationYear: 2039 });
  const [userLow, userHigh] = zoe < yan ? [zoe, yan] : [yan, zoe];
  const [created] = await db
    .insert(schema.match)
    .values({ userLow, userHigh, mode: "friends", source: "like" })
    .returning({ id: schema.match.id });
  const zoePage = await signIn(browser, zoe, baseURL);
  const yanPage = await signIn(browser, yan, baseURL);
  await zoePage.goto(`/messages/${created?.id}`);
  await yanPage.goto(`/messages/${created?.id}`);

  await zoePage.getByRole("button", { name: "Jouer à un mini-jeu" }).click();
  await zoePage
    .getByRole("dialog", { name: "Un petit jeu ?" })
    .getByRole("button", { name: /^Tu préfères/ })
    .click();
  const zoeCard = zoePage.getByRole("list", { name: "Messages" }).getByText("Tu préfères…");
  await expect(zoeCard).toBeVisible();

  // Yan answers first: his choice stays hidden from Zoé until she plays.
  const yanList = yanPage.getByRole("list", { name: "Messages" });
  await expect(yanList.getByText("Tu préfères…")).toBeVisible({ timeout: 10_000 });
  const yanOptions = yanList.locator("li").filter({ hasText: "Tu préfères…" }).getByRole("button");
  const firstLabel = (await yanOptions.nth(0).textContent()) ?? "";
  await yanOptions.nth(0).click();
  await expect(yanList.getByText("En attente de Zoé…")).toBeVisible();
  await expect(zoePage.getByText("Yan a répondu. À toi !")).toBeVisible({ timeout: 10_000 });
  expect(
    (await new AxeBuilder({ page: zoePage }).withTags(WCAG).analyze()).violations.map((v) => v.id),
  ).toEqual([]);

  const zoeOptions = zoePage
    .getByRole("list", { name: "Messages" })
    .locator("li")
    .filter({ hasText: "Tu préfères…" })
    .getByRole("button")
    .filter({ hasNotText: firstLabel });
  await zoeOptions.first().click();
  await expect(zoePage.getByText("Avis partagés.")).toBeVisible();
  await expect(yanPage.getByText("Avis partagés.")).toBeVisible({ timeout: 10_000 });
});
