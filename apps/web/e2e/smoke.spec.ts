import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test.describe("home", () => {
  test("presents the project, the eligible schools and the non-affiliation notice", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle("Epilove");
    await expect(page.locator("html")).toHaveAttribute("lang", "fr");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("atomes crochus");
    await expect(page.getByRole("list", { name: "Écoles concernées" }).getByRole("listitem")).toHaveText([
      "EPITA",
      "ESME",
      "Sup'Biotech",
      "ISG",
      "IPSA",
    ]);
    await expect(page.getByText("non affilié à IONIS Education Group")).toBeVisible();
  });

  test("has no detectable accessibility violations (WCAG 2.2 AA)", async ({ page }) => {
    await page.goto("/");
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
      .analyze();
    expect(results.violations).toEqual([]);
  });

  test("sends the baseline security headers", async ({ request }) => {
    const response = await request.get("/");
    const headers = response.headers();
    expect(headers["x-content-type-options"]).toBe("nosniff");
    expect(headers["x-frame-options"]).toBe("DENY");
    expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    expect(headers["x-powered-by"]).toBeUndefined();
  });
});

test.describe("api", () => {
  test("is mounted under /api", async ({ request }) => {
    const response = await request.get("/api/health");
    expect(response.ok()).toBe(true);
    expect(await response.json()).toMatchObject({ status: "ok" });
  });

  test("serves the RPC procedures", async ({ request }) => {
    const response = await request.post("/api/rpc/campus/checkEmail", {
      data: { json: { email: "prenom.nom@supbiotech.fr" } },
    });
    expect(response.ok()).toBe(true);
    expect(await response.json()).toMatchObject({
      json: { eligible: true, school: { slug: "supbiotech" } },
    });
  });
});
