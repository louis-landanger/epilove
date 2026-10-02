import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { isolateClientIp, latestCode, signUp } from "./support/auth";

test.describe("sign-in", () => {
  test("a school address receives a code and lands on onboarding", async ({ page }) => {
    await signUp(page, "ipsa.fr");
    await expect(page).toHaveURL(/\/onboarding$/);
  });

  test("addresses outside the schools are refused before any email is sent", async ({ page }) => {
    await page.goto("/connexion");
    await page.getByLabel("Email d'école").fill("someone@gmail.com");
    await page.getByRole("button", { name: "Recevoir mon code" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "Seules les adresses" })).toBeVisible();
  });

  test("a wrong code is rejected", async ({ page }) => {
    const email = `e2e.wrong.${Date.now()}@esme.fr`;
    await isolateClientIp(page);
    await page.goto("/connexion");
    await page.getByLabel("Email d'école").fill(email);
    await page.getByRole("button", { name: "Recevoir mon code" }).click();
    await latestCode(email);
    await page.getByRole("textbox").first().click();
    await page.keyboard.type("000000");
    await expect(page.getByRole("alert").filter({ hasText: "pas le bon" })).toBeVisible();
  });

  test("signed-out visitors are sent to sign-in, with the page to come back to", async ({ page }) => {
    await page.goto("/profil");
    await expect(page).toHaveURL(/\/connexion\?suite=%2Fprofil$/);
  });

  test("the sign-in page is accessible and carries a nonce-based CSP", async ({ page }) => {
    const response = await page.goto("/connexion");
    expect(response?.headers()["content-security-policy"]).toContain("'nonce-");
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
      .analyze();
    expect(results.violations).toEqual([]);
  });
});
