import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "happy-dom",
    setupFiles: ["./vitest.setup.ts"],
    // visual/ holds the Playwright visual tests (`pnpm test:visual`).
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
