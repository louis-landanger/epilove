import { readFileSync } from "node:fs";
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

interface IndexEntry {
  readonly id: string;
  readonly title: string;
  readonly name: string;
  readonly type: "story" | "docs";
}

// Built by `pnpm build-storybook` before the tests run.
const index = JSON.parse(
  readFileSync(new URL("../storybook-static/index.json", import.meta.url), "utf8"),
) as {
  entries: Record<string, IndexEntry>;
};
const stories = Object.values(index.entries).filter((entry) => entry.type === "story");

for (const story of stories) {
  test(`${story.title} / ${story.name}`, async ({ page }) => {
    await page.goto(`/iframe.html?id=${story.id}&viewMode=story`);
    const root = page.locator("#storybook-root");
    await expect(root.locator(":scope > *").first()).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    await expect(root).toHaveScreenshot(`${story.id}.png`);
    const results = await new AxeBuilder({ page })
      .include("#storybook-root")
      .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
      .analyze();
    expect(results.violations).toEqual([]);
  });
}
