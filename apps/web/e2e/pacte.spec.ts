import { randomUUID } from "node:crypto";
import AxeBuilder from "@axe-core/playwright";
import { createDatabase, schema } from "@epilove/db";
import { deleteSeason, enrolMembers, revealSeason, upsertSeason } from "@epilove/db/repositories/pact";
import {
  answerQuestionnaire,
  cleanupTestMembers,
  createTestMember,
  prepareTestDatabase,
} from "@epilove/db/testing";
import { type Browser, expect, type Page, test } from "@playwright/test";

/**
 * The Pact reveal (PAC-03) with two browsers: both participants watch the
 * countdown, then the `pact.reveal` broadcast starts the sequence on both
 * screens and each one gets the other as their match.
 */
const url = process.env.DATABASE_URL;
const { db, close } = createDatabase(url ?? "postgres://invalid", { maxConnections: 2 });
const seasons: string[] = [];

test.skip(!url, "Needs DATABASE_URL and the local services (pnpm services:up).");

test.beforeAll(async () => {
  await prepareTestDatabase(db);
});
test.afterAll(async () => {
  for (const id of seasons) {
    await deleteSeason(db, id);
  }
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

test("the Pact reveal reaches both participants at the same time", async ({ browser, baseURL }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Two-browser scenario runs once.");
  test.setTimeout(90_000);
  const aya = await createTestMember(db, {
    firstName: "Aya",
    gender: "woman",
    interestedIn: ["man"],
    graduationYear: 2039,
  });
  const basile = await createTestMember(db, {
    firstName: "Basile",
    gender: "man",
    interestedIn: ["woman"],
    graduationYear: 2039,
  });
  for (const member of [aya, basile]) {
    await answerQuestionnaire(db, member);
  }
  const now = Date.now();
  const revealAt = new Date(now + 20_000);
  const seasonId = await upsertSeason(db, {
    slug: `test-e2e-${randomUUID()}`,
    name: "E2E",
    opensAt: new Date(now - 2 * 86_400_000),
    closesAt: new Date(now - 86_400_000),
    revealAt,
    status: "computed",
  });
  seasons.push(seasonId);
  await enrolMembers(
    db,
    seasonId,
    [aya, basile].map((userId) => ({ userId, modes: ["love"] as const })),
    new Date(now),
  );
  const [low, high] = aya < basile ? [aya, basile] : [basile, aya];
  const [result] = await db
    .insert(schema.pactResult)
    .values({
      seasonId,
      mode: "love",
      userLow: low,
      userHigh: high,
      score: 0.93,
      explanation: {
        sections: ["values", "lifestyle", "campus", "nerd", "plans"].map((section) => ({
          section,
          score: 0.9,
        })),
      },
    })
    .returning({ id: schema.pactResult.id });

  const ayaPage = await signIn(browser, aya, baseURL);
  const basilePage = await signIn(browser, basile, baseURL);
  for (const page of [ayaPage, basilePage]) {
    await page.goto("/campus/pacte");
    await expect(page.getByText("Révélation dans")).toBeVisible();
    await expect(page.getByText("Tu participes : Love.")).toBeVisible();
  }
  const countdown = await new AxeBuilder({ page: ayaPage }).withTags(WCAG).analyze();
  expect(countdown.violations).toEqual([]);

  // The worker reveals at the minute; here the test does it at the exact time
  // (whichever comes first, the other finds the season already revealed).
  await ayaPage.waitForTimeout(Math.max(0, revealAt.getTime() - Date.now() + 200));
  await revealSeason(db, { seasonId, now: new Date(), keep: new Set([result?.id ?? ""]) });

  await Promise.all([
    expect(ayaPage.getByText("Analyse des échantillons")).toBeVisible({ timeout: 15_000 }),
    expect(basilePage.getByText("Analyse des échantillons")).toBeVisible({ timeout: 15_000 }),
  ]);
  await expect(ayaPage.getByRole("heading", { name: "Ton match du Pacte" })).toBeVisible({ timeout: 20_000 });
  await expect(ayaPage.getByRole("heading", { name: /Basile/ })).toBeVisible();
  await expect(ayaPage.getByRole("link", { name: "Écrire à Basile" })).toBeVisible();
  await expect(basilePage.getByRole("heading", { name: /Aya/ })).toBeVisible({ timeout: 20_000 });
  await expect(ayaPage.getByRole("img", { name: "Votre compatibilité, section par section" })).toBeVisible();

  // Wait for the entrance animations before checking contrasts.
  await ayaPage.waitForTimeout(2500);
  const revealed = await new AxeBuilder({ page: ayaPage }).withTags(WCAG).analyze();
  expect(revealed.violations).toEqual([]);
});
