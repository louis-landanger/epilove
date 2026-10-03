import AxeBuilder from "@axe-core/playwright";
import { createDatabase, schema } from "@epilove/db";
import { createEvent } from "@epilove/db/repositories/campus-events";
import { cleanupTestMembers, createTestMember, prepareTestDatabase } from "@epilove/db/testing";
import { type Browser, expect, type Page, test } from "@playwright/test";

/**
 * Flash (IRL-04): during an event, one participant scans the other's QR code
 * (the camera opens its link), the other types the first one's code: a match.
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

async function signIn(browser: Browser, memberId: string, baseURL: string | undefined): Promise<Page> {
  const context = await browser.newContext();
  await context.addCookies([
    { name: "epilove_dev_user", value: memberId, url: baseURL ?? "http://127.0.0.1:3100" },
  ]);
  return context.newPage();
}

const codeOn = async (page: Page) => {
  const text = (await page.locator("main p.font-mono span[aria-hidden]").textContent()) ?? "";
  return text.replace(/\s/g, "");
};

test("two participants scan each other and match", async ({ browser, baseURL }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Two-browser scenario runs once.");
  const host = await createTestMember(db, { graduationYear: 2039, role: "organizer" });
  const eventId = await createEvent(db, host, {
    organizerName: "BDE (test)",
    title: "Soirée Flash e2e",
    description: "",
    venue: "Foyer",
    spotId: null,
    startsAt: new Date(Date.now() - 10 * 60_000),
    endsAt: new Date(Date.now() + 3 * 3_600_000),
    schoolIds: [],
  });
  const eli = await createTestMember(db, {
    firstName: "Éli",
    gender: "woman",
    interestedIn: ["man"],
    graduationYear: 2039,
  });
  const tom = await createTestMember(db, {
    firstName: "Tom",
    gender: "man",
    interestedIn: ["woman"],
    graduationYear: 2039,
  });
  await db.insert(schema.eventRsvp).values([
    { eventId, userId: eli, status: "going" },
    { eventId, userId: tom, status: "going" },
  ]);

  const eliPage = await signIn(browser, eli, baseURL);
  const tomPage = await signIn(browser, tom, baseURL);
  await eliPage.goto(`/campus/evenements/${eventId}`);
  await eliPage.getByRole("link", { name: "Flash : rencontrer sur place" }).click();
  await expect(eliPage.getByRole("img", { name: "Ton QR code Flash" })).toBeVisible();
  await expect.poll(() => codeOn(eliPage)).toMatch(/^[0-9A-Z]{8}$/);
  expect(
    (await new AxeBuilder({ page: eliPage }).withTags(WCAG).analyze()).violations.map((v) => v.id),
  ).toEqual([]);

  // Tom's camera opens the link of Éli's QR code.
  await tomPage.goto(`/campus/evenements/${eventId}/flash/${await codeOn(eliPage)}`);
  await expect(tomPage.getByText(/Dès que l'autre personne scanne ton code/)).toBeVisible();
  await tomPage.getByRole("link", { name: "Montrer mon code" }).click();
  await expect.poll(() => codeOn(tomPage)).toMatch(/^[0-9A-Z]{8}$/);

  // Éli types Tom's code.
  await eliPage.getByLabel("Le code de l'autre personne").fill(await codeOn(tomPage));
  await eliPage.getByRole("button", { name: "Valider" }).click();
  await expect(eliPage.getByText("Liaison établie avec Tom !")).toBeVisible();
  await eliPage.getByRole("link", { name: "Écrire à Tom" }).click();
  await expect(eliPage.getByRole("textbox", { name: "Écrire à Tom" })).toBeVisible();
});
