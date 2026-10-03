import AxeBuilder from "@axe-core/playwright";
import { createDatabase, schema } from "@epilove/db";
import { cleanupTestMembers, createTestMember, prepareTestDatabase } from "@epilove/db/testing";
import { type Browser, expect, type Page, test } from "@playwright/test";

/**
 * Campus events (IRL-01): an organizer publishes, two matches answer and see
 * each other only once both share it, then the organizer cancels.
 */
const url = process.env.DATABASE_URL;
const { db, close } = createDatabase(url ?? "postgres://invalid", { maxConnections: 2 });
const TITLE = "Quiz de test e2e";

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

const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

test("an organizer publishes an event, matches find each other there, then it is cancelled", async ({
  browser,
  baseURL,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Multi-browser scenario runs once.");
  const host = await createTestMember(db, { firstName: "Orso", graduationYear: 2039, role: "organizer" });
  const lea = await createTestMember(db, { firstName: "Léa", graduationYear: 2039 });
  const max = await createTestMember(db, { firstName: "Max", graduationYear: 2039 });
  const [userLow, userHigh] = lea < max ? [lea, max] : [max, lea];
  await db.insert(schema.match).values({ userLow, userHigh, mode: "friends", source: "like" });

  const hostPage = await signIn(browser, host, baseURL);
  await hostPage.goto("/campus/evenements");
  await hostPage.getByRole("link", { name: "Créer un événement" }).click();
  await expect(hostPage.getByRole("heading", { level: 1, name: "Nouvel événement" })).toBeVisible();
  expect(
    (await new AxeBuilder({ page: hostPage }).withTags(WCAG).analyze()).violations.map((v) => v.id),
  ).toEqual([]);
  await hostPage.getByLabel("Titre").fill(TITLE);
  await hostPage.getByLabel("Nom de l'asso").fill("Asso de test");
  const tomorrow = new Date(Date.now() + 86_400_000);
  const day = new Date(tomorrow.getTime() - tomorrow.getTimezoneOffset() * 60_000).toISOString().slice(0, 11);
  await hostPage.getByLabel("Début").fill(`${day}19:00`);
  await hostPage.getByLabel("Autre lieu").check();
  await hostPage.getByLabel("Adresse ou lieu").fill("Foyer du campus");
  await hostPage.getByRole("button", { name: "Publier" }).click();
  await expect(hostPage.getByRole("heading", { level: 1, name: TITLE })).toBeVisible();
  const eventUrl = hostPage.url();

  // Léa answers and shares; Max has not answered yet.
  const leaPage = await signIn(browser, lea, baseURL);
  await leaPage.goto(eventUrl);
  await leaPage.getByRole("button", { name: "J'y vais" }).click();
  await expect(leaPage.getByRole("button", { name: "J'y vais" })).toHaveAttribute("aria-pressed", "true");
  await leaPage.getByLabel("Le dire à mes liaisons").check();
  await expect(
    leaPage.getByText("Aucune de tes liaisons n'a partagé sa venue pour l'instant."),
  ).toBeVisible();

  // Max answers without sharing: he sees nobody, and Léa does not see him.
  const maxPage = await signIn(browser, max, baseURL);
  await maxPage.goto(eventUrl);
  await maxPage.getByRole("button", { name: "Peut-être" }).click();
  await expect(maxPage.getByText(/Réponds et active « Le dire à mes liaisons »/)).toBeVisible();
  await leaPage.reload();
  await expect(
    leaPage.getByText("Aucune de tes liaisons n'a partagé sa venue pour l'instant."),
  ).toBeVisible();

  // Once he shares too, they see each other.
  await maxPage.getByLabel("Le dire à mes liaisons").check();
  await expect(maxPage.getByRole("link", { name: "Écrire à Léa" })).toBeVisible();
  await leaPage.reload();
  await expect(leaPage.getByRole("link", { name: "Écrire à Max" })).toBeVisible();
  expect(
    (await new AxeBuilder({ page: leaPage }).withTags(WCAG).analyze()).violations.map((v) => v.id),
  ).toEqual([]);

  await hostPage.getByRole("button", { name: "Annuler l'événement" }).click();
  await hostPage.getByRole("dialog").getByRole("button", { name: "Oui, annuler" }).click();
  await expect(hostPage.getByText("Cet événement est annulé.")).toBeVisible();
  await leaPage.reload();
  await expect(leaPage.getByText("Cet événement est annulé.")).toBeVisible();
  await expect(leaPage.getByRole("button", { name: "J'y vais" })).toHaveCount(0);
});

test("the events list has no detectable accessibility violations", async ({ browser, baseURL }) => {
  const member = await createTestMember(db, { graduationYear: 2039 });
  const page = await signIn(browser, member, baseURL);
  await page.goto("/campus/evenements");
  await expect(page.getByRole("heading", { level: 1, name: "Événements" })).toBeVisible();
  expect((await new AxeBuilder({ page }).withTags(WCAG).analyze()).violations.map((v) => v.id)).toEqual([]);
});
