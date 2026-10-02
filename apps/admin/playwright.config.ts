import { existsSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";

// The tests prepare data directly in the database and the object storage.
if (existsSync("../../.env")) {
  process.loadEnvFile("../../.env");
}

const port = Number(process.env.PLAYWRIGHT_ADMIN_PORT ?? 3101);
const baseURL = `http://127.0.0.1:${port}`;
const executablePath = process.env.PW_CHROMIUM_PATH;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL,
    trace: "retain-on-failure",
    launchOptions: executablePath ? { executablePath } : {},
    ...devices["Desktop Chrome"],
  },
  webServer: {
    command: `pnpm start --port ${port}`,
    url: `${baseURL}/connexion`,
    reuseExistingServer: !process.env.CI,
    // The staff auth server checks request origins against its own URL.
    env: { ADMIN_URL: baseURL, PASSKEY_RP_ID: "127.0.0.1" },
    timeout: 120_000,
  },
});
