import { createDatabase, schema } from "@atomes/db";
import { cleanupTestMembers, createTestMember, prepareTestDatabase } from "@atomes/db/testing";
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

/** Question of the week (COM-01), cross-school index (COM-02) and Wrapped (COM-03). */
const url = process.env.DATABASE_URL;
const { db, close } = createDatabase(url ?? "postgres://invalid", { maxConnections: 2 });
const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

test.skip(!url, "Needs DATABASE_URL and the local services (pnpm services:up).");
// One database client per file, closed after the last test.
test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  await prepareTestDatabase(db);
});
test.afterAll(async () => {
  await cleanupTestMembers(db);
  await close();
});

test("answers the question of the week, then sees the results", async ({ context, page, baseURL }) => {
  const member = await createTestMember(db, { graduationYear: 2039 });
  await context.addCookies([
    { name: "atomes_dev_user", value: member, url: baseURL ?? "http://127.0.0.1:3100" },
  ]);
  await page.goto("/campus/question");
  await expect(page.getByRole("heading", { level: 1, name: "Question de la semaine" })).toBeVisible();
  const options = page.locator("main button[aria-pressed]");
  const label = (await options.first().textContent()) ?? "";
  await options.first().click();
  await expect(page.getByText(`Ta réponse : ${label}`)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Ce que répond le campus" })).toBeVisible();
  expect((await new AxeBuilder({ page }).withTags(WCAG).analyze()).violations.map((v) => v.id)).toEqual([]);

  await page.goto("/campus/indice");
  await expect(page.getByRole("heading", { level: 1, name: "Indice inter-écoles" })).toBeVisible();
  expect((await new AxeBuilder({ page }).withTags(WCAG).analyze()).violations.map((v) => v.id)).toEqual([]);
});

test("sees their Wrapped and downloads it as an image", async ({ context, page, baseURL, request }) => {
  const member = await createTestMember(db, { graduationYear: 2039 });
  const other = await createTestMember(db, { graduationYear: 2039 });
  const [userLow, userHigh] = member < other ? [member, other] : [other, member];
  await db.insert(schema.match).values({ userLow, userHigh, mode: "friends", source: "like" });
  await context.addCookies([
    { name: "atomes_dev_user", value: member, url: baseURL ?? "http://127.0.0.1:3100" },
  ]);
  await page.goto("/campus/wrapped");
  await expect(page.getByRole("heading", { level: 1, name: "Ton Wrapped" })).toBeVisible();
  await expect(page.getByText("liaison cette année", { exact: true })).toBeVisible();
  expect((await new AxeBuilder({ page }).withTags(WCAG).analyze()).violations.map((v) => v.id)).toEqual([]);

  const image = await page.request.get("/campus/wrapped/image");
  expect(image.status()).toBe(200);
  expect(image.headers()["content-type"]).toBe("image/png");
  expect(image.headers()["cache-control"]).toContain("no-store");
  // Signed out: no image, the sign-in page instead.
  const signedOut = await request.get("/campus/wrapped/image", { maxRedirects: 0 });
  expect(signedOut.status()).toBe(307);
  expect(signedOut.headers().location).toContain("/connexion");
});
