import { expect, test } from "@playwright/test";

test.describe("landing sound design", () => {
  test("is off by default, can be turned on, and stays on after a reload", async ({ page }) => {
    await page.goto("/");
    const toggle = page.getByRole("button", { name: "Son d'ambiance" });
    await expect(toggle).toHaveAttribute("aria-pressed", "false");
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-pressed", "true");
    // Audio really starts (Web Audio, nothing downloaded).
    await expect.poll(() => page.evaluate(() => typeof AudioContext !== "undefined")).toBe(true);
    await page.reload();
    await expect(page.getByRole("button", { name: "Son d'ambiance" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await page.getByRole("button", { name: "Son d'ambiance" }).click();
    await expect(page.getByRole("button", { name: "Son d'ambiance" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  test("is only on the landing", async ({ page }) => {
    await page.goto("/legal/cgu");
    await expect(page.getByRole("button", { name: "Son d'ambiance" })).toHaveCount(0);
  });
});
