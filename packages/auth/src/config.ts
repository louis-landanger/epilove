import { z } from "zod";

const envSchema = z.object({
  APP_ENV: z.enum(["development", "test", "staging", "production"]).default("production"),
  /** Public URL of the app serving /api/auth (Better Auth base URL). */
  APP_URL: z.url(),
  /** Other origins allowed to call the auth API (the back-office). */
  AUTH_TRUSTED_ORIGINS: z.string().default(""),
  BETTER_AUTH_SECRET: z.string().min(32),
  EMAIL_HMAC_SECRET: z.string().min(32),
  PASSKEY_RP_ID: z.string().min(1),
  TURNSTILE_SECRET_KEY: z.string().optional(),
  VALKEY_URL: z.string().optional(),
});

export type AuthEnv = z.infer<typeof envSchema>;

export function authEnvFromProcess(env: Record<string, string | undefined> = process.env): AuthEnv {
  const result = envSchema.safeParse(env);
  if (!result.success) {
    const keys = result.error.issues.map((issue) => issue.path.join(".")).join(", ");
    throw new Error(`Invalid authentication environment: ${keys}`);
  }
  return result.data;
}

/** Sign-in code policy (ONB-02, docs/07-confiance-securite.md part B). */
export const OTP_POLICY = {
  length: 6,
  expiresInSeconds: 600,
  allowedAttempts: 5,
  /** Codes sent per address and per hour. */
  perEmailPerHour: 5,
  /** Codes requested per IP address and per 10 minutes. */
  perIpPerTenMinutes: 10,
} as const;

export const SESSION_POLICY = {
  /** Sliding expiry: 30 days of inactivity. */
  expiresInSeconds: 30 * 24 * 3600,
  updateAgeSeconds: 24 * 3600,
} as const;
