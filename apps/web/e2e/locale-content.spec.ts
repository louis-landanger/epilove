import { createDatabase } from "@epilove/db";
import { cleanupTestMembers, createTestMember, prepareTestDatabase } from "@epilove/db/testing";
import { expect, test } from "@playwright/test";

/**
 * English (PLT-04) reaches the content the server writes too: prompt
 * questions, interests, questionnaire… not only the interface strings.
 */
const url = process.env.DATABASE_URL;
const { db, close } = createDatabase(url ?? "postgres://invalid", { maxConnections: 2 });

test.skip(!url, "Needs DATABASE_URL and the local services (pnpm services:up).");
test.describe.configure({ mode: "serial" });
test.use({ locale: "en-GB" });

test.beforeAll(async () => {
  await prepareTestDatabase(db);
});
test.afterAll(async () => {
  await cleanupTestMembers(db);
  await close();
});

test("a member who reads English gets profiles and the questionnaire in English", async ({
  browser,
  baseURL,
}) => {
  const jade = await createTestMember(db, {
    firstName: "Jade",
    gender: "woman",
    interestedIn: ["man"],
    graduationYear: 2039,
  });
  const tom = await createTestMember(db, {
    firstName: "Tom",
    gender: "man",
    interestedIn: ["woman"],
    graduationYear: 2039,
    prompts: ["Always up for a quiz."],
  });
  const context = await browser.newContext({ locale: "en-GB" });
  await context.addCookies([
    { name: "epilove_dev_user", value: jade, url: baseURL ?? "http://127.0.0.1:3100" },
  ]);
  const page = await context.newPage();

  await page.goto(`/membres/${tom}`);
  await expect(page.getByRole("button", { name: "Like", exact: true })).toBeVisible();
  await expect(page.getByText("A test topic (1)")).toBeVisible();
  await expect(page.getByText("Un sujet de test (1)")).toHaveCount(0);

  await page.goto("/campus/questionnaire");
  await page.getByRole("button", { name: "Start" }).click();
  await expect(page.getByText("What matters most to you in a relationship?")).toBeVisible();
  await expect(page.getByText("Dans une relation, ce qui compte le plus pour toi ?")).toHaveCount(0);
});
