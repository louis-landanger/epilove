import { existsSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";

// Some tests adjust data directly in the database; the dating scenarios create their own members.
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
    // French is the default language; English tests opt in (Accept-Language follows the locale).
    locale: "fr-FR",
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
      // AI conversation starters (CHAT-04) on, against the local stand-in below.
      env: {
        APP_URL: baseURL,
        PASSKEY_RP_ID: "127.0.0.1",
        API_RATE_LIMIT_ANONYMOUS: "100000",
        AI_ICEBREAKERS_ENABLED: "1",
        ANTHROPIC_API_KEY: "e2e",
        ANTHROPIC_BASE_URL: "http://127.0.0.1:3102",
      },
      timeout: 120_000,
    },
    {
      // Background jobs (photo processing) and the outbox relay to Centrifugo (realtime chat).
      command: "cd ../worker && ./node_modules/.bin/tsx --env-file-if-exists=../../.env src/index.ts",
      // Not 3101: the back-office end-to-end tests serve it there, and turbo runs both suites at once.
      env: { WORKER_HEALTH_PORT: "3103" },
      wait: { stdout: /Worker connected/ },
      reuseExistingServer: !process.env.CI,
      gracefulShutdown: { signal: "SIGTERM", timeout: 5000 },
    },
    {
      // Stand-in for the Claude API: the scenarios never call the real one.
      command: "node e2e/support/anthropic-mock.mjs",
      url: "http://127.0.0.1:3102/health",
      reuseExistingServer: !process.env.CI,
      timeout: 10_000,
    },
  ],
});
