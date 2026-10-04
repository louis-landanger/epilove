import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { signUp } from "./support/auth";
import { onboardMember } from "./support/onboarding";

test.describe("install guide (PLT-01)", () => {
  test.describe.configure({ timeout: 150_000 });

  test("suggests installing on phones and explains it for the right system", async ({ page }, testInfo) => {
    const mobile = testInfo.project.name === "mobile";
    await signUp(page, "esme.fr");
    await onboardMember(page, "Ines");

    await page.goto("/aide");
    const banner = page.getByRole("complementary", { name: "Voir comment" });
    if (!mobile) {
      await expect(banner).toHaveCount(0);
      await page.getByRole("link", { name: /Installer l'application/ }).click();
      await expect(page.getByRole("tab", { name: "Ordinateur" })).toHaveAttribute("aria-selected", "true");
      await expect(page.getByRole("button", { name: /Repère l'icône d'installation/ })).toBeVisible();
      return;
    }

    await expect(banner).toBeVisible();
    await banner.getByRole("link", { name: "Voir comment" }).click();
    await expect(
      page.getByRole("heading", { name: "Atomes sur ton écran d'accueil", level: 1 }),
    ).toBeVisible();
    await expect(page.getByRole("tab", { name: "Android" })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("complementary", { name: "Voir comment" })).toHaveCount(0);

    await page.getByRole("button", { name: "Mettre l'animation en pause" }).click();
    await page.getByRole("button", { name: /Confirme/ }).click();
    await expect(page.getByRole("button", { name: /Confirme/ })).toHaveAttribute("aria-current", "step");
    await expect(page.getByText("Étape 3 sur 3")).toBeVisible();
    // Measured once the illustration has finished animating in (contrast is checked on what is painted).
    await expect
      .poll(
        async () =>
          (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze())
            .violations,
        { timeout: 10_000 },
      )
      .toEqual([]);

    await page.getByRole("tab", { name: "iPhone" }).click();
    await expect(page.getByRole("button", { name: /Touche Partager/ })).toBeVisible();
    await expect(page.getByText(/iOS 16\.4/)).toBeVisible();

    // Dismissed for good in this browser.
    await page.goto("/aide");
    await page.getByRole("button", { name: "Masquer ce message" }).click();
    await expect(banner).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(banner).toHaveCount(0);
  });
});
