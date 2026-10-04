import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { signUp } from "./support/auth";
import { onboardMember } from "./support/onboarding";

test.describe("app lock (SAF-13)", () => {
  test.describe.configure({ timeout: 150_000 });

  test("locks a new tab until the code is typed, and can be turned off", async ({ page, context }) => {
    await signUp(page, "epita.fr");
    await onboardMember(page, "Sam");

    await page.goto("/reglages");
    await page.getByRole("switch", { name: "Verrouiller l'application sur cet appareil" }).click();
    await page.getByRole("radio", { name: /Un code Atomes/ }).click();
    await page.getByLabel("Code (4 à 6 chiffres)").fill("4821");
    await page.getByLabel("Confirme le code").fill("4821");
    await page.getByRole("radio", { name: "Immédiatement" }).click();
    await page.getByRole("button", { name: "Activer le verrouillage" }).click();
    await expect(page.getByText("Verrouillage activé sur cet appareil.")).toBeVisible();
    // Turning it on does not lock the current tab.
    await expect(page.getByRole("dialog", { name: "Atomes est verrouillé" })).toHaveCount(0);

    const other = await context.newPage();
    await other.goto("/profil");
    const lock = other.getByRole("dialog", { name: "Atomes est verrouillé" });
    await expect(lock).toBeVisible();
    await expect(other.locator("#contenu")).toBeHidden();
    expect(
      (
        await new AxeBuilder({ page: other })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
          .analyze()
      ).violations,
    ).toEqual([]);

    await lock.getByLabel("Ton code").fill("1111");
    await lock.getByRole("button", { name: "Déverrouiller" }).click();
    await expect(lock.getByText(/Code incorrect\. Encore 4 essais/)).toBeVisible();
    await lock.getByLabel("Ton code").fill("4821");
    await lock.getByRole("button", { name: "Déverrouiller" }).click();
    await expect(lock).toBeHidden();
    await expect(other.getByRole("heading", { name: "Mon profil", level: 1 })).toBeVisible();

    // A reload right away stays unlocked; turning the lock off frees new tabs.
    await other.reload();
    await expect(other.getByRole("dialog", { name: "Atomes est verrouillé" })).toHaveCount(0);
    await page.getByRole("switch", { name: "Verrouiller l'application sur cet appareil" }).click();
    await expect(page.getByText("Verrouillage désactivé.")).toBeVisible();
    const third = await context.newPage();
    await third.goto("/profil");
    await expect(third.getByRole("heading", { name: "Mon profil", level: 1 })).toBeVisible();
    await expect(third.getByRole("dialog", { name: "Atomes est verrouillé" })).toHaveCount(0);
  });
});
