import AxeBuilder from "@axe-core/playwright";
import { schema } from "@epilove/db";
import { expect, test } from "@playwright/test";
import { eq } from "drizzle-orm";
import { createMember, createPendingPhoto, createReport, db, signInStaff } from "./support";

const WCAG = ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"];

test.describe("back-office", () => {
  test.describe.configure({ timeout: 90_000 });
  test.afterAll(() => db.close());

  test("members cannot use the back-office", async ({ page }) => {
    const member = await createMember("user");
    await signInStaff(page, member.email);
    await expect(page.getByRole("heading", { name: "Accès réservé" })).toBeVisible();
  });

  test("a moderator reviews a photo and decides on a report", async ({ page }) => {
    const moderator = await createMember("moderator");
    const reporter = await createMember();
    const reported = await createMember();
    await createPendingPhoto(reported.id);
    const reportId = await createReport(reporter.id, reported.id);

    await signInStaff(page, moderator.email);
    await expect(page.getByRole("heading", { name: "Vue d'ensemble" })).toBeVisible();
    expect((await new AxeBuilder({ page }).withTags(WCAG).analyze()).violations).toEqual([]);

    await page.getByRole("link", { name: "Photos", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Photos à vérifier" })).toBeVisible();
    await page.keyboard.press("a");
    await expect(page.getByText("Photo validée")).toBeVisible();

    await page.goto(`/signalements/${reportId}`);
    await expect(page.getByText("Insultes répétées dans nos messages.")).toBeVisible();
    expect((await new AxeBuilder({ page }).withTags(WCAG).analyze()).violations).toEqual([]);
    await page.getByRole("radio", { name: "Avertissement" }).click();
    await page.getByRole("radio", { name: "Respect" }).click();
    await expect(page.getByLabel("Motivation envoyée à la personne")).toHaveValue(/insultants/);
    await page.getByRole("button", { name: "Enregistrer la décision" }).click();
    await page.waitForURL("**/signalements");

    const [report] = await db.db.select().from(schema.report).where(eq(schema.report.id, reportId));
    expect(report?.status).toBe("resolved");

    await page.goto("/journal");
    await expect(page.getByText("decision.warning").first()).toBeVisible();
    await expect(page.getByText("report.viewed").first()).toBeVisible();
  });
});
