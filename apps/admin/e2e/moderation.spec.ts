import AxeBuilder from "@axe-core/playwright";
import { schema } from "@epilove/db";
import { expect, test } from "@playwright/test";
import { eq } from "drizzle-orm";
import {
  createMember,
  createPendingPhoto,
  createPendingVerification,
  createReport,
  db,
  signInStaff,
} from "./support";

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

  test("the dashboards show aggregates and delays (ADM-09)", async ({ page }) => {
    const moderator = await createMember("moderator");
    await signInStaff(page, moderator.email);
    await page.getByRole("link", { name: "Tableaux de bord" }).click();
    await expect(page.getByRole("heading", { name: "Tableaux de bord", level: 1 })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Modération" })).toBeVisible();
    await expect(page.getByRole("rowheader", { name: /P1/ })).toBeVisible();
    await expect(page.getByText("Couverture du campus")).toBeVisible();
    expect((await new AxeBuilder({ page }).withTags(WCAG).analyze()).violations).toEqual([]);

    await page.getByRole("link", { name: "7 jours" }).click();
    await expect(page).toHaveURL(/periode=7/);
    await expect(page.getByRole("link", { name: "7 jours" })).toHaveAttribute("aria-current", "page");
    await expect(page.getByText(moderator.email)).toHaveCount(0);
  });

  test("a moderator compares a gesture selfie and grants the badge (ONB-08)", async ({ page }) => {
    const moderator = await createMember("moderator");
    const member = await createMember();
    await createPendingPhoto(member.id);
    const selfie = await createPendingVerification(member.id);

    await signInStaff(page, moderator.email);
    await expect(page.getByRole("heading", { name: "Vue d'ensemble" })).toBeVisible();
    await page.getByRole("link", { name: "Vérifications", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Vérifications photo" })).toBeVisible();
    // The queue is shared with other runs: decide until this member's selfie is done.
    for (let round = 0; round < 50; round += 1) {
      const [row] = await db.db
        .select({ status: schema.photoVerification.status })
        .from(schema.photoVerification)
        .where(eq(schema.photoVerification.id, selfie.id));
      if (row?.status !== "pending") break;
      await expect(page.getByText("Geste demandé")).toBeVisible();
      expect((await new AxeBuilder({ page }).withTags(WCAG).analyze()).violations).toEqual([]);
      await page.keyboard.press("a");
      await expect(page.getByText("Photo vérifiée").last()).toBeVisible();
    }

    const [user] = await db.db
      .select({ verifiedAt: schema.appUser.photoVerifiedAt })
      .from(schema.appUser)
      .where(eq(schema.appUser.id, member.id));
    expect(user?.verifiedAt).not.toBeNull();
    expect(await selfie.storage.head(selfie.key)).toBeNull();
  });
});
