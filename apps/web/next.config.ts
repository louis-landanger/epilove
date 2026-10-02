import { existsSync } from "node:fs";
import { resolve } from "node:path";
import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

// Local development reads the repository-wide `.env` (Next.js only looks in apps/web).
const rootEnvFile = resolve(process.cwd(), "../../.env");
if (existsSync(rootEnvFile)) {
  process.loadEnvFile(rootEnvFile);
}

// Baseline headers. A nonce-based Content-Security-Policy comes with `proxy.ts` (docs/07, part B).
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
];

const nextConfig: NextConfig = {
  reactCompiler: true,
  typedRoutes: true,
  poweredByHeader: false,
  transpilePackages: [
    "@epilove/api",
    "@epilove/contracts",
    "@epilove/core",
    "@epilove/crypto",
    "@epilove/db",
    "@epilove/media",
    "@epilove/realtime",
    "@epilove/tokens",
  ],
  // esbuild bundles the service worker at build time (@serwist/turbopack).
  serverExternalPackages: ["postgres", "esbuild", "esbuild-wasm"],
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

export default withNextIntl(nextConfig);
