import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import { signUp } from "./support/auth";
import { onboardMember } from "./support/onboarding";

async function expectAccessible(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(results.violations).toEqual([]);
}

test.describe("settings and safety", () => {
  test.describe.configure({ timeout: 150_000 });

  test("privacy settings, hidden contacts, pause and account deletion", async ({ page }) => {
    await signUp(page, "esme.fr");
    await onboardMember(page, "Noa");

    await page.goto("/reglages");
    await expect(page.getByRole("heading", { name: "Réglages", level: 1 })).toBeVisible();
    await expectAccessible(page);

    const hideYear = page.getByRole("switch", { name: "Me masquer de ma promo" });
    await hideYear.click();
    await expect(hideYear).toBeChecked();

    await page.getByLabel("Email d'école à masquer").fill("Mon.Ex@epita.fr");
    await page.getByRole("button", { name: "Masquer", exact: true }).click();
    await expect(page.getByText("mo…@epita.fr")).toBeVisible();

    await page.getByRole("switch", { name: "Mettre mon profil en pause" }).click();
    await expect(page.getByText("Ton profil est en pause.")).toBeVisible();

    await page.reload();
    await expect(page.getByRole("switch", { name: "Me masquer de ma promo" })).toBeChecked();
    await expect(page.getByRole("switch", { name: "Mettre mon profil en pause" })).toBeChecked();
    await expect(page.getByText("mo…@epita.fr")).toBeVisible();
    await expect(page.getByText("Cet appareil")).toBeVisible();

    await page.getByRole("button", { name: "Télécharger mes données" }).click();
    const download = page.getByRole("link", { name: "Télécharger", exact: true });
    await expect(download).toBeVisible({ timeout: 30_000 });
    const zip = await page.request.get((await download.getAttribute("href")) ?? "");
    expect(zip.status()).toBe(200);
    expect(zip.headers()["content-type"]).toBe("application/zip");

    await page.getByRole("button", { name: "Supprimer mon compte" }).click();
    const dialog = page.getByRole("dialog", { name: "Supprimer ton compte ?" });
    const confirm = dialog.getByRole("button", { name: "Supprimer définitivement" });
    await expect(confirm).toBeDisabled();
    await dialog.getByLabel("Écris SUPPRIMER pour confirmer").fill("supprimer");
    await confirm.click();
    await page.waitForURL("**/compte/supprime");
    await expect(page.getByRole("heading", { name: "Ton compte est supprimé." })).toBeVisible();

    await page.goto("/profil");
    await expect(page).toHaveURL(/\/connexion/);
  });

  test("the help page lists emergency numbers and is accessible", async ({ page }) => {
    await signUp(page, "isg.fr");
    await page.goto("/aide");
    // Members still in onboarding are sent back to it; help is for everyone once signed up.
    if (page.url().endsWith("/onboarding")) {
      await onboardMember(page, "Lou");
      await page.goto("/aide");
    }
    await expect(page.getByRole("heading", { name: "Aide et sécurité", level: 1 })).toBeVisible();
    await expect(page.getByRole("link", { name: "Appeler le 17" })).toHaveAttribute("href", "tel:17");
    await expect(page.getByRole("link", { name: /3919/ })).toBeVisible();
    await expectAccessible(page);
  });
});
