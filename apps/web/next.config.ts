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
  // Camera: gesture selfie (ONB-08); microphone: voice prompts (PRO-06). Same origin only.
  { key: "Permissions-Policy", value: "camera=(self), microphone=(self), geolocation=(), payment=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
];

const nextConfig: NextConfig = {
  reactCompiler: true,
  typedRoutes: true,
  poweredByHeader: false,
  transpilePackages: [
    "@epilove/api",
    "@epilove/auth",
    "@epilove/contracts",
    "@epilove/core",
    "@epilove/crypto",
    "@epilove/db",
    "@epilove/email",
    "@epilove/media",
    "@epilove/rate-limit",
    "@epilove/realtime",
    "@epilove/tokens",
    "@epilove/ui",
  ],
  serverExternalPackages: [
    "postgres",
    "ioredis",
    "nodemailer",
    "@aws-sdk/client-s3",
    "@aws-sdk/s3-presigned-post",
    // esbuild bundles the service worker at build time (@serwist/turbopack).
    "esbuild",
    "esbuild-wasm",
  ],
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

export default withNextIntl(nextConfig);
