import AxeBuilder from "@axe-core/playwright";
import { createDatabase, schema } from "@epilove/db";
import { cleanupTestMembers, createTestMember, prepareTestDatabase } from "@epilove/db/testing";
import { type Browser, expect, type Page, test } from "@playwright/test";

/**
 * Photos and voice messages (CHAT-06, CHAT-07) with two browsers: a photo
 * served by imgproxy, a view-once photo opened a single time, a voice
 * message recorded from Chromium's fake microphone.
 */
const url = process.env.DATABASE_URL;
const { db, close } = createDatabase(url ?? "postgres://invalid", { maxConnections: 2 });

test.skip(!url, "Needs DATABASE_URL and the local services (pnpm services:up).");
test.use({
  launchOptions: {
    executablePath: process.env.PW_CHROMIUM_PATH,
    args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"],
  },
});

test.beforeAll(async () => {
  await prepareTestDatabase(db);
});
test.afterAll(async () => {
  await cleanupTestMembers(db);
  await close();
});

async function signIn(browser: Browser, memberId: string, baseURL: string | undefined): Promise<Page> {
  const context = await browser.newContext({ permissions: ["microphone"] });
  await context.addCookies([
    { name: "epilove-dev-member", value: memberId, url: baseURL ?? "http://127.0.0.1:3100" },
  ]);
  return context.newPage();
}

/** A 1×1 PNG. */
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

test("sends a photo, a view-once photo and a voice message", async ({ browser, baseURL }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Two-browser scenario runs once.");
  const ines = await createTestMember(db, { firstName: "Inès", graduationYear: 2039 });
  const jules = await createTestMember(db, { firstName: "Jules", graduationYear: 2039 });
  const [userLow, userHigh] = ines < jules ? [ines, jules] : [jules, ines];
  const [created] = await db
    .insert(schema.match)
    .values({ userLow, userHigh, mode: "friends", source: "like" })
    .returning({ id: schema.match.id });
  const inesPage = await signIn(browser, ines, baseURL);
  const julesPage = await signIn(browser, jules, baseURL);
  await inesPage.goto(`/messages/${created?.id}`);
  await julesPage.goto(`/messages/${created?.id}`);
  const inesMessages = inesPage.getByRole("list", { name: "Messages" });
  const julesMessages = julesPage.getByRole("list", { name: "Messages" });

  // A photo: re-encoded in the browser, then served through imgproxy.
  await inesPage.locator('input[type="file"]').setInputFiles({
    name: "photo.png",
    mimeType: "image/png",
    buffer: PNG,
  });
  const preview = inesPage.getByRole("dialog", { name: "Aperçu de la photo" });
  await preview.getByRole("button", { name: "Envoyer" }).click();
  await expect(preview).toBeHidden();
  const photo = julesMessages.getByRole("img", { name: "Photo envoyée dans la conversation" });
  await expect(photo).toBeVisible({ timeout: 10_000 });
  await expect.poll(() => photo.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);

  // A view-once photo: opened a single time.
  await inesPage.locator('input[type="file"]').setInputFiles({
    name: "secret.png",
    mimeType: "image/png",
    buffer: PNG,
  });
  await preview.getByLabel("Éphémère : une seule ouverture").check();
  await preview.getByRole("button", { name: "Envoyer" }).click();
  await expect(inesMessages.getByText("Pas encore ouverte")).toBeVisible();
  await julesMessages.getByRole("button", { name: "Ouvrir", exact: true }).click({ timeout: 10_000 });
  const opened = julesPage.getByRole("dialog", { name: "Photo éphémère" });
  await expect(opened.getByRole("img", { name: "Photo envoyée dans la conversation" })).toBeVisible();
  await opened.getByRole("button", { name: "Fermer" }).click();
  await expect(julesMessages.getByText("Ouverte", { exact: true })).toBeVisible();
  await expect(julesMessages.getByRole("button", { name: "Ouvrir", exact: true })).toHaveCount(0);
  await expect(inesMessages.getByText("Ouverte", { exact: true })).toBeVisible({ timeout: 10_000 });

  // A voice message from the fake microphone, listened to before sending.
  await inesPage.getByRole("button", { name: "Enregistrer un message vocal" }).click();
  await expect(inesPage.getByText("Enregistrement en cours")).toBeAttached();
  await inesPage.waitForTimeout(1500);
  await inesPage.getByRole("button", { name: "Arrêter l'enregistrement" }).click();
  await inesPage.getByRole("button", { name: "Envoyer le message vocal" }).click();
  const voice = julesMessages.getByRole("figure", { name: /^Message vocal de 0:0\d$/ });
  await expect(voice).toBeVisible({ timeout: 10_000 });
  await voice.getByRole("button", { name: "Vitesse de lecture : 1×" }).click();
  await expect(voice.getByRole("button", { name: "Vitesse de lecture : 1,5×" })).toBeVisible();
  await expect(inesPage.getByRole("button", { name: "Enregistrer un message vocal" })).toBeVisible();

  const results = await new AxeBuilder({ page: julesPage })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(results.violations).toEqual([]);
});
