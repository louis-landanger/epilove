import { defineConfig, devices } from "@playwright/test";

// Visual tests of the design system: one screenshot per Storybook story.
const port = Number(process.env.STORYBOOK_PORT ?? 6106);
const executablePath = process.env.PW_CHROMIUM_PATH;

export default defineConfig({
  testDir: "./visual",
  // Same file names on every platform: the reference images are committed.
  snapshotPathTemplate: "{testDir}/__screenshots__/{arg}{ext}",
  fullyParallel: true,
  retries: 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  expect: { toHaveScreenshot: { maxDiffPixelRatio: 0.01, animations: "disabled", caret: "hide" } },
  use: {
    ...devices["Desktop Chrome"],
    baseURL: `http://127.0.0.1:${port}`,
    viewport: { width: 720, height: 900 },
    deviceScaleFactor: 1,
    colorScheme: "dark",
    reducedMotion: "reduce",
    launchOptions: executablePath ? { executablePath } : {},
  },
  webServer: {
    command: `node visual/serve.mjs`,
    env: { PORT: String(port) },
    url: `http://127.0.0.1:${port}/index.json`,
    reuseExistingServer: !process.env.CI,
  },
});
