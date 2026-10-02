import { existsSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";

// Some tests adjust data directly in the database (dates that cannot be waited for).
if (existsSync("../../.env")) {
  process.loadEnvFile("../../.env");
}

// Overridable so several checkouts can run their end-to-end tests side by side.
const port = Number(process.env.PLAYWRIGHT_PORT ?? 3100);
const baseURL = `http://127.0.0.1:${port}`;
// Lets environments with a preinstalled Chromium skip `playwright install`.
const executablePath = process.env.PW_CHROMIUM_PATH;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL,
    trace: "retain-on-failure",
    launchOptions: executablePath ? { executablePath } : {},
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  webServer: [
    {
      command: `pnpm start --port ${port}`,
      url: `${baseURL}/api/health`,
      reuseExistingServer: !process.env.CI,
      // The auth server checks request origins against APP_URL.
      // Every test comes from 127.0.0.1: the per-address API ceiling would add up across tests.
      env: { APP_URL: baseURL, PASSKEY_RP_ID: "127.0.0.1", API_RATE_LIMIT_ANONYMOUS: "100000" },
      timeout: 120_000,
    },
    {
      // Background jobs (photo processing), so uploads are really processed.
      command: "cd ../worker && ./node_modules/.bin/tsx --env-file-if-exists=../../.env src/index.ts",
      wait: { stdout: /Worker connected/ },
      reuseExistingServer: !process.env.CI,
      gracefulShutdown: { signal: "SIGTERM", timeout: 5000 },
    },
  ],
});
