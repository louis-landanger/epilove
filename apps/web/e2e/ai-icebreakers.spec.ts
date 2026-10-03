import AxeBuilder from "@axe-core/playwright";
import { createDatabase, schema } from "@epilove/db";
import { messagesOf } from "@epilove/db/repositories/messaging";
import { cleanupTestMembers, createTestMember, prepareTestDatabase } from "@epilove/db/testing";
import { expect, test } from "@playwright/test";

/**
 * AI conversation starters (CHAT-04), against the local stand-in of the
 * Claude API (e2e/support/anthropic-mock.mjs): consent first, then ideas
 * that only fill the composer; the consent can be withdrawn in the settings.
 */
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

test("asks for consent, suggests ideas, never sends them", async ({ context, page, baseURL }) => {
  const kim = await createTestMember(db, {
    firstName: "Kim",
    graduationYear: 2039,
    prompts: ["Je grimpe tous les jeudis soir"],
  });
  const noa = await createTestMember(db, { firstName: "Noa", graduationYear: 2039 });
  const [userLow, userHigh] = kim < noa ? [kim, noa] : [noa, kim];
  const [created] = await db
    .insert(schema.match)
    .values({ userLow, userHigh, mode: "friends", source: "like" })
    .returning({ id: schema.match.id });
  await context.addCookies([
    { name: "epilove_dev_user", value: kim, url: baseURL ?? "http://127.0.0.1:3100" },
  ]);

  await page.goto(`/messages/${created?.id}`);
  await page.getByRole("button", { name: "Des idées par IA" }).click();
  const consent = page.getByRole("dialog", { name: "Des idées de début de conversation par IA ?" });
  await expect(consent.getByText(/sans ton prénom/)).toBeVisible();
  expect((await new AxeBuilder({ page }).withTags(WCAG).analyze()).violations.map((v) => v.id)).toEqual([]);
  await consent.getByRole("button", { name: "Activer" }).click();

  const idea = page.getByRole("button", { name: "Plutôt escalade en salle ou en falaise ?" });
  await expect(idea).toBeVisible();
  expect((await new AxeBuilder({ page }).withTags(WCAG).analyze()).violations.map((v) => v.id)).toEqual([]);
  await idea.click();
  await expect(page.getByRole("textbox", { name: "Écrire à Noa" })).toHaveValue(
    "Plutôt escalade en salle ou en falaise ?",
  );
  // Only in the composer: nothing was sent.
  expect((await messagesOf(db, created?.id ?? "", { limit: 10 })).messages).toEqual([]);

  await page.goto("/reglages/notifications");
  const toggle = page.getByRole("switch", { name: "Idées de conversation par IA" });
  await expect(toggle).toBeChecked();
  // The switch is a visually hidden checkbox: operated with the keyboard.
  await toggle.focus();
  await page.keyboard.press("Space");
  await expect(page.getByText("Enregistré.")).toBeVisible();
  await page.reload();
  await expect(page.getByRole("switch", { name: "Idées de conversation par IA" })).not.toBeChecked();
});
