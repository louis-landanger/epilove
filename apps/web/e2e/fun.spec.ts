import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const WCAG = ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"];

test.describe("easter eggs", () => {
  test("the 404 page can be played", async ({ page }) => {
    const response = await page.goto("/cette-page-n-existe-pas");
    expect(response?.status()).toBe(404);
    await expect(page.getByRole("heading", { name: "Cette page a rompu la liaison." })).toBeVisible();
    expect((await new AxeBuilder({ page }).withTags(WCAG).analyze()).violations).toEqual([]);
    await page.getByRole("button", { name: "Jouer" }).click();
    await expect(page.getByText(/^\d+ s$/)).toBeVisible();
    await page.keyboard.down("ArrowLeft");
    await page.waitForTimeout(300);
    await page.keyboard.up("ArrowLeft");
    await expect(page.getByText(/Score : \d+/)).toBeVisible();
  });

  test("the hidden terminal answers", async ({ page }) => {
    await page.goto("/terminal");
    const prompt = page.getByRole("textbox", { name: /Commande/ });
    await expect(prompt).toBeFocused();
    await prompt.fill("help");
    await prompt.press("Enter");
    await expect(page.getByText(/^Commandes :/)).toBeVisible();
    await prompt.fill("cat charte.txt");
    await prompt.press("Enter");
    await expect(page.getByText("2. Le consentement d'abord.")).toBeVisible();
    await prompt.fill("sudo love");
    await prompt.press("Enter");
    await expect(page.getByText("Permission refusée. Le consentement, ça ne se force pas.")).toBeVisible();
    await prompt.press("ArrowUp");
    await expect(prompt).toHaveValue("sudo love");
    expect((await new AxeBuilder({ page }).withTags(WCAG).analyze()).violations).toEqual([]);
  });

  test("the Konami code switches chemistry mode on", async ({ page }) => {
    await page.goto("/");
    for (const key of [
      "ArrowUp",
      "ArrowUp",
      "ArrowDown",
      "ArrowDown",
      "ArrowLeft",
      "ArrowRight",
      "ArrowLeft",
      "ArrowRight",
      "b",
      "a",
    ]) {
      await page.keyboard.press(key);
    }
    await expect(page.getByText("Mode chimie activé")).toBeVisible();
  });
});
