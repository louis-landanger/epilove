import { existsSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";

// The dating scenarios create their own members in the local database (session B).
if (existsSync("../../.env")) {
  process.loadEnvFile("../../.env");
}

const port = 3100;
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
      // AI conversation starters (CHAT-04) on, against the local stand-in below.
      env: {
        AI_ICEBREAKERS_ENABLED: "1",
        ANTHROPIC_API_KEY: "e2e",
        ANTHROPIC_BASE_URL: "http://127.0.0.1:3102",
      },
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      // Outbox relay to Centrifugo: needed by the realtime chat scenario.
      command: "pnpm --dir ../worker exec tsx --env-file-if-exists=../../.env src/index.ts",
      url: "http://127.0.0.1:3101/health",
      env: { WORKER_HEALTH_PORT: "3101" },
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
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
