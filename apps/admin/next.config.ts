import { existsSync } from "node:fs";
import { resolve } from "node:path";
import type { NextConfig } from "next";

// Local development reads the repository-wide `.env`.
const rootEnvFile = resolve(process.cwd(), "../../.env");
if (existsSync(rootEnvFile)) {
  process.loadEnvFile(rootEnvFile);
}

// Staff tool: never indexed, never framed. A nonce-based CSP comes with `proxy.ts`.
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "X-Robots-Tag", value: "noindex, nofollow" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
];

const nextConfig: NextConfig = {
  reactCompiler: true,
  typedRoutes: true,
  poweredByHeader: false,
  transpilePackages: [
    "@atomes/api",
    "@atomes/auth",
    "@atomes/contracts",
    "@atomes/core",
    "@atomes/crypto",
    "@atomes/db",
    "@atomes/email",
    "@atomes/media",
    "@atomes/rate-limit",
    "@atomes/tokens",
    "@atomes/ui",
  ],
  serverExternalPackages: [
    "postgres",
    "ioredis",
    "nodemailer",
    "@aws-sdk/client-s3",
    "@aws-sdk/s3-presigned-post",
  ],
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
