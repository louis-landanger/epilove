import AxeBuilder from "@axe-core/playwright";
import { createDatabase } from "@epilove/db";
import { cleanupTestMembers, createTestMember, prepareTestDatabase } from "@epilove/db/testing";
import { expect, test } from "@playwright/test";

/** Question of the week (COM-01) and cross-school index (COM-02). */
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

test("answers the question of the week, then sees the results", async ({ context, page, baseURL }) => {
  const member = await createTestMember(db, { graduationYear: 2039 });
  await context.addCookies([
    { name: "epilove-dev-member", value: member, url: baseURL ?? "http://127.0.0.1:3100" },
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
