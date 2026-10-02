import AxeBuilder from "@axe-core/playwright";
import { createDatabase, schema } from "@epilove/db";
import { cleanupTestMembers, createTestMember, prepareTestDatabase } from "@epilove/db/testing";
import { type Browser, expect, type Page, test } from "@playwright/test";

/**
 * Date safety kit (IRL-03): after an accepted date proposal, the member
 * creates a link, a trusted person opens it without an account, then sees the
 * member's answer to "Tout s'est bien passé ?".
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

async function signIn(browser: Browser, memberId: string | null, baseURL: string | undefined): Promise<Page> {
  const context = await browser.newContext();
  if (memberId) {
    await context.addCookies([
      { name: "epilove-dev-member", value: memberId, url: baseURL ?? "http://127.0.0.1:3100" },
    ]);
  }
  return context.newPage();
}

test("shares an accepted date with a trusted person, who sees the check-in", async ({
  browser,
  baseURL,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Multi-browser scenario runs once.");
  const lina = await createTestMember(db, { firstName: "Lina", graduationYear: 2039 });
  const omar = await createTestMember(db, { firstName: "Omar", graduationYear: 2039 });
  const [userLow, userHigh] = lina < omar ? [lina, omar] : [omar, lina];
  const [created] = await db
    .insert(schema.match)
    .values({ userLow, userHigh, mode: "love", source: "like" })
    .returning({ id: schema.match.id });
  const linaPage = await signIn(browser, lina, baseURL);
  const omarPage = await signIn(browser, omar, baseURL);
  await linaPage.goto(`/messages/${created?.id}`);
  await omarPage.goto(`/messages/${created?.id}`);

  await linaPage.getByRole("button", { name: "Proposer un date" }).click();
  const sheet = linaPage.getByRole("dialog", { name: "Proposer un date" });
  await sheet.getByLabel("Où ?").selectOption({ label: "Place Valmy" });
  const tomorrow = new Date(Date.now() + 86_400_000);
  const day = new Date(tomorrow.getTime() - tomorrow.getTimezoneOffset() * 60_000).toISOString().slice(0, 11);
  await sheet.getByLabel("Quand ?").fill(`${day}19:00`);
  await sheet.getByRole("button", { name: "Proposer" }).click();
  await omarPage.getByRole("button", { name: "Accepter" }).click({ timeout: 10_000 });
  await expect(linaPage.getByText("Accepté")).toBeVisible({ timeout: 10_000 });

  await linaPage.getByRole("button", { name: "Kit sécurité" }).click();
  const kit = linaPage.getByRole("dialog", { name: "Kit sécurité" });
  await expect(
    kit.getByText("Ce qui est partagé : le prénom de Omar, le lieu et l'heure. Rien d'autre."),
  ).toBeVisible();
  await kit.getByRole("button", { name: "Créer un lien à partager" }).click();
  const link = kit.getByRole("textbox", { name: "Lien à envoyer" });
  await expect(link).toHaveValue(/\/partage\/[A-Za-z0-9_-]{40,}$/);
  const sharedUrl = await link.inputValue();
  expect(
    (await new AxeBuilder({ page: linaPage }).withTags(WCAG).analyze()).violations.map((v) => v.id),
  ).toEqual([]);

  // The trusted person has no account.
  const friend = await signIn(browser, null, baseURL);
  await friend.goto(sharedUrl);
  await expect(friend.getByRole("heading", { level: 1, name: "Détails d'un date" })).toBeVisible();
  await expect(friend.getByText("Lina t'a envoyé les détails de son date, au cas où.")).toBeVisible();
  await expect(friend.getByText("Omar", { exact: true })).toBeVisible();
  await expect(friend.getByText("Place Valmy")).toBeVisible();
  await expect(friend.getByText(/Pas encore de nouvelles/)).toBeVisible();
  expect(
    (await new AxeBuilder({ page: friend }).withTags(WCAG).analyze()).violations.map((v) => v.id),
  ).toEqual([]);

  // Lina answers from her kit (normally opened from the check-in notification).
  const share = (await db.select().from(schema.dateShare)).find((s) => s.userId === lina);
  await linaPage.goto(`/messages/securite/${share?.id}`);
  await expect(linaPage.getByRole("heading", { level: 1, name: "Ton kit sécurité" })).toBeVisible();
  await linaPage.getByRole("button", { name: "Pas vraiment" }).click();
  await expect(linaPage.getByText(/On est là\./)).toBeVisible();
  await expect(linaPage.getByRole("button", { name: "Signaler Omar" })).toBeVisible();
  expect(
    (await new AxeBuilder({ page: linaPage }).withTags(WCAG).analyze()).violations.map((v) => v.id),
  ).toEqual([]);

  await friend.reload();
  await expect(friend.getByText(/Lina a indiqué que ça ne s'est pas bien passé/)).toBeVisible();

  // Stopping the link closes the page at once.
  await linaPage.getByRole("button", { name: "Arrêter ce lien" }).click();
  await expect(linaPage.getByText("Arrêté")).toBeVisible();
  await friend.reload();
  await expect(friend.getByRole("heading", { level: 1, name: "Lien inactif" })).toBeVisible();
});
