import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import { isolateClientIp, latestCode, signUp } from "./support/auth";
import { onboardMember } from "./support/onboarding";

const MAILPIT = process.env.MAILPIT_URL ?? "http://localhost:8025";

async function expectAccessible(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(results.violations).toEqual([]);
}

test.describe("English (PLT-04)", () => {
  test.describe.configure({ timeout: 150_000 });

  test.describe("with an English browser", () => {
    test.use({ locale: "en-GB" });

    test("lands on the English site and keeps the language from page to page", async ({ page }) => {
      await page.goto("/");
      await expect(page).toHaveURL(/\/en$/);
      await expect(page.locator("html")).toHaveAttribute("lang", "en");
      await expect(page.getByRole("button", { name: "English" })).toHaveAttribute("aria-pressed", "true");
      await expectAccessible(page);

      await page.getByRole("contentinfo").getByRole("link", { name: "Privacy", exact: true }).click();
      await expect(page).toHaveURL(/\/en\/legal\/confidentialite$/);
      await expect(page.locator("html")).toHaveAttribute("lang", "en");

      // An explicit choice wins over the browser language, and sticks.
      await page.getByRole("button", { name: "Français" }).first().click();
      await expect(page).toHaveURL(/\/legal\/confidentialite$/);
      await expect(page.locator("html")).toHaveAttribute("lang", "fr");
      await page.goto("/");
      await expect(page).toHaveURL(/\/$/);
      await expect(page.locator("html")).toHaveAttribute("lang", "fr");
    });

    test("sends the sign-in code in English and remembers the language on the account", async ({ page }) => {
      await isolateClientIp(page);
      const email = `e2e.en.${Date.now()}.${Math.floor(Math.random() * 1e6)}@ipsa.fr`;
      await page.goto("/connexion");
      await expect(page.locator("html")).toHaveAttribute("lang", "en");
      await page.getByLabel("School email").fill(email);
      await page.getByRole("button", { name: "Get my code" }).click();
      await expect(page.getByRole("heading", { name: "Check your inbox." })).toBeVisible();
      const code = await latestCode(email);
      const search = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`);
      const { messages } = (await search.json()) as { messages: Array<{ Subject: string }> };
      expect(messages[0]?.Subject).toMatch(/is your Epilove code$/);

      await page.getByRole("textbox").first().click();
      await page.keyboard.type(code);
      await page.waitForURL("**/onboarding");
      await expect(page.locator("html")).toHaveAttribute("lang", "en");
    });
  });

  test("serves English pages behind a TLS-terminating reverse proxy", async ({ request }) => {
    // Caddy (infra/dev-host) and Coolify forward plain HTTP with X-Forwarded-Proto: https.
    for (const path of ["/en", "/en/legal/cgu"]) {
      const response = await request.get(path, { headers: { "x-forwarded-proto": "https" } });
      expect(response.status(), path).toBe(200);
      expect(await response.text(), path).toContain('<html lang="en"');
    }
  });

  test("switches the whole app to English from the settings", async ({ page, browser }) => {
    const email = await signUp(page, "isg.fr");
    await onboardMember(page, "Malik");

    await page.goto("/reglages");
    await expect(page.getByRole("heading", { name: "Langue" })).toBeVisible();
    await page.getByRole("button", { name: "English" }).click();
    await expect(page.getByRole("heading", { name: "Settings", level: 1 })).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expectAccessible(page);

    // The choice is stored on the account: another device (French browser) signs in to English.
    const other = await browser.newPage({ locale: "fr-FR" });
    await isolateClientIp(other);
    await other.goto(new URL("/connexion?suite=/reglages", page.url()).toString());
    await other.getByLabel("Email d'école").fill(email);
    await other.getByRole("button", { name: "Recevoir mon code" }).click();
    await expect(other.getByRole("heading", { name: "Vérifie tes emails." })).toBeVisible();
    const code = await latestCode(email, 2);
    await other.getByRole("textbox").first().click();
    await other.keyboard.type(code);
    await expect(other.getByRole("heading", { name: "Settings", level: 1 })).toBeVisible();
    await other.close();
  });
});
