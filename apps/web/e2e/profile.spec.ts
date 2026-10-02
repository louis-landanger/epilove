import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { signUp } from "./support/auth";
import { onboardMember } from "./support/onboarding";

test.describe("my profile", () => {
  test.describe.configure({ timeout: 120_000 });

  test("previews the profile as others see it and edits it", async ({ page }) => {
    await signUp(page, "ipsa.fr");
    await onboardMember(page, "Inès");

    await page.goto("/profil");
    await expect(page.getByRole("heading", { name: "Mon profil", level: 1 })).toBeVisible();
    const preview = page.getByRole("article", { name: "Inès" });
    await expect(preview.getByRole("heading", { name: /Inès 22/ })).toBeVisible();
    await expect(preview.getByText("Réponse deux.")).toBeVisible();
    await expect(preview.getByText("En vérification").first()).toBeVisible();
    const score = page.getByRole("img", { name: /Profil complété à \d+ %/ });
    const before = Number((await score.getAttribute("aria-label"))?.match(/(\d+) %/)?.[1]);

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
      .analyze();
    expect(results.violations).toEqual([]);

    await page.getByRole("tab", { name: "Modifier" }).click();
    await page.getByLabel("Cursus ou majeure").fill("Cycle ingénieur aéro");
    await page.getByRole("button", { name: "Anglais" }).click();
    await page.getByRole("button", { name: "Enregistrer" }).first().click();
    await expect(page.getByText("C'est enregistré.")).toBeVisible();

    const after = Number((await score.getAttribute("aria-label"))?.match(/(\d+) %/)?.[1]);
    expect(after).toBeGreaterThan(before);

    await page.getByRole("tab", { name: "Aperçu" }).click();
    await expect(preview.getByText("Cycle ingénieur aéro")).toBeVisible();
    await expect(preview.getByText("Anglais")).toBeVisible();

    // Edits survive a reload (server-rendered from the API).
    await page.reload();
    await expect(page.getByRole("article", { name: "Inès" }).getByText("Cycle ingénieur aéro")).toBeVisible();
  });
});
