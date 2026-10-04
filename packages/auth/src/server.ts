import {
  calendarDateIn,
  DEFAULT_LOCALE,
  isLocale,
  LOCALE_COOKIE,
  LYON_CAMPUS,
  nextReverificationDue,
  parseSchoolEmail,
  requestLocale,
  uuidv7,
} from "@atomes/core";
import { emailHmac } from "@atomes/crypto";
import type { Database } from "@atomes/db";
import { schema } from "@atomes/db";
import { isSignupBlocked, markCampusVerified, recordEmailProof } from "@atomes/db/repositories/accounts";
import { type Mailer, signInCodeEmail } from "@atomes/email";
import type { RateLimiter } from "@atomes/rate-limit";
import { passkey } from "@better-auth/passkey";
import { betterAuth, type SecondaryStorage } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { admin, captcha, emailOTP, genericOAuth } from "better-auth/plugins";
import { eq } from "drizzle-orm";
import { type AuthEnv, OTP_POLICY, SESSION_POLICY } from "./config";
import { checkForgeIdProfile, FORGE_ID_PROVIDER, type ForgeIdConfig } from "./forge-id";
import { checkMicrosoftProfile, MICROSOFT_PROVIDER, type MicrosoftConfig } from "./microsoft";

export interface AuthDependencies {
  readonly env: AuthEnv;
  readonly db: Database;
  readonly mailer: Mailer;
  readonly limiter: RateLimiter;
  /** Key-value store for sessions and rate limits (Valkey); in-memory when absent. */
  readonly secondaryStorage?: SecondaryStorage;
  readonly options?: AuthOptions;
  /** ONB-11: Forge ID sign-in, only when configured. */
  readonly forgeId?: ForgeIdConfig | null;
  /** ONB-10: Microsoft sign-in restricted to the schools' tenants, only when configured. */
  readonly microsoft?: MicrosoftConfig | null;
}

/** Differences between the member app and the back-office. */
export interface AuthOptions {
  /** `false` on the back-office: only existing accounts can sign in. */
  readonly allowSignUp?: boolean;
  readonly sessionExpiresInSeconds?: number;
  /** Distinct per app: cookies are shared by every port of a host. */
  readonly cookiePrefix?: string;
}

/** Endpoints that receive an email address in their body. */
const EMAIL_ENDPOINTS = new Set(["/email-otp/send-verification-otp", "/sign-in/email-otp"]);

export class SchoolEmailError extends APIError {}

const list = (value: string) =>
  value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

/**
 * Better Auth configuration (docs/07-confiance-securite.md, part B):
 * one-time codes sent only to eligible school addresses, passkeys, admin
 * roles, rate limits, optional Turnstile.
 */
export function createAuth({
  env,
  db,
  mailer,
  limiter,
  secondaryStorage,
  options = {},
  forgeId = null,
  microsoft = null,
}: AuthDependencies) {
  const sessionExpiresIn = options.sessionExpiresInSeconds ?? SESSION_POLICY.expiresInSeconds;
  const trustedOrigins = [
    env.APP_URL,
    ...env.AUTH_TRUSTED_ORIGINS.split(",").map((origin) => origin.trim()),
  ].filter(Boolean);

  return betterAuth({
    appName: "Atomes",
    baseURL: env.APP_URL,
    basePath: "/api/auth",
    secret: env.BETTER_AUTH_SECRET,
    trustedOrigins,
    database: drizzleAdapter(db, {
      provider: "pg",
      schema: {
        user: schema.appUser,
        session: schema.authSession,
        account: schema.authAccount,
        verification: schema.authVerification,
        passkey: schema.authPasskey,
      },
    }),
    secondaryStorage,
    emailAndPassword: { enabled: false },
    socialProviders: microsoft
      ? {
          microsoft: {
            clientId: microsoft.clientId,
            clientSecret: microsoft.clientSecret,
            // Work and school accounts only; the tenant list below narrows it to the five schools.
            tenantId: "organizations",
            // OpenID Connect claims only: no Microsoft Graph access, no profile photo.
            disableDefaultScope: true,
            scope: ["openid", "email", "profile"],
            disableProfilePhoto: true,
            disableSignUp: options.allowSignUp === false,
            mapProfileToUser: (profile) => {
              const check = checkMicrosoftProfile(profile, microsoft);
              if (!check.ok) {
                throw new APIError("FORBIDDEN", {
                  code:
                    check.reason === "tenant_not_allowed"
                      ? "MICROSOFT_TENANT_NOT_ALLOWED"
                      : "SCHOOL_EMAIL_REQUIRED",
                });
              }
              return { email: check.email, name: "", emailVerified: true };
            },
          },
        }
      : undefined,
    user: {
      additionalFields: {
        schoolId: { type: "string", input: false, required: false },
        emailHmac: { type: "string", input: false, required: false },
        status: { type: "string", input: false, required: false, defaultValue: "onboarding" },
        locale: { type: "string", input: false, required: false, defaultValue: DEFAULT_LOCALE },
      },
    },
    session: {
      expiresIn: sessionExpiresIn,
      updateAge: Math.min(SESSION_POLICY.updateAgeSeconds, Math.floor(sessionExpiresIn / 2)),
    },
    advanced: {
      cookiePrefix: options.cookiePrefix ?? "atomes",
      useSecureCookies: env.APP_ENV === "production" || env.APP_ENV === "staging",
      database: { generateId: () => uuidv7() },
      ipAddress: {
        ipAddressHeaders: list(env.AUTH_IP_HEADERS),
        trustedProxies: list(env.AUTH_TRUSTED_PROXIES),
      },
    },
    rateLimit: {
      enabled: true,
      storage: secondaryStorage ? "secondary-storage" : "memory",
      window: 60,
      max: 60,
      customRules: {
        "/email-otp/send-verification-otp": { window: 600, max: OTP_POLICY.perIpPerTenMinutes },
        "/sign-in/email-otp": { window: 600, max: 30 },
      },
    },
    hooks: {
      after: createAuthMiddleware(async (ctx) => {
        // Generic OAuth providers are social providers in Better Auth 1.7: callback at /callback/<id>.
        if (
          ctx.path.startsWith("/callback/") &&
          ctx.params?.id === FORGE_ID_PROVIDER &&
          ctx.context.newSession
        ) {
          // Only Lyon students get through `mapProfileToUser`: the campus is now proven.
          await markCampusVerified(db, ctx.context.newSession.user.id, new Date()).catch(() => {
            console.error("[auth] campus verification could not be recorded");
          });
          return;
        }
        if (ctx.context.newSession) {
          // The account's language follows the member from one device to another (PLT-04).
          const locale = (ctx.context.newSession.user as { locale?: unknown }).locale;
          if (isLocale(locale)) {
            ctx.setCookie(LOCALE_COOKIE, locale, {
              path: "/",
              maxAge: 365 * 86_400,
              sameSite: "lax",
              httpOnly: true,
              secure: env.APP_ENV === "production" || env.APP_ENV === "staging",
            });
          }
        }
        const microsoftCallback = ctx.path.startsWith("/callback/") && ctx.params?.id === MICROSOFT_PROVIDER;
        if ((ctx.path !== "/sign-in/email-otp" && !microsoftCallback) || !ctx.context.newSession) {
          return;
        }
        // Every sign-in with a code, or with the school's Microsoft account, proves the mailbox again (ONB-09).
        const now = new Date();
        const nextDue = new Date(
          `${nextReverificationDue(calendarDateIn(LYON_CAMPUS.timeZone, now))}T00:00:00Z`,
        );
        await recordEmailProof(db, ctx.context.newSession.user.id, now, nextDue).catch(() => {
          console.error("[auth] email proof could not be recorded");
        });
      }),
      before: createAuthMiddleware(async (ctx) => {
        if (!EMAIL_ENDPOINTS.has(ctx.path)) {
          return;
        }
        const email = typeof ctx.body?.email === "string" ? ctx.body.email : "";
        const parsed = parseSchoolEmail(email);
        if (!parsed.ok) {
          throw new APIError("BAD_REQUEST", {
            code: parsed.reason === "domain_not_allowed" ? "SCHOOL_EMAIL_REQUIRED" : "INVALID_EMAIL",
            message: "Une adresse d'école valide est requise.",
          });
        }
        if (parsed.canonicalEmail !== email) {
          // Clients canonicalise before calling: one mailbox, one identity.
          throw new APIError("BAD_REQUEST", {
            code: "EMAIL_NOT_CANONICAL",
            message: "Adresse non canonique.",
          });
        }
        const fingerprint = emailHmac(env.EMAIL_HMAC_SECRET, parsed.canonicalEmail);
        // A person who declared being under 18 cannot come back before their birthday (ONB-04).
        if (await isSignupBlocked(db, fingerprint, calendarDateIn(LYON_CAMPUS.timeZone, new Date()))) {
          throw new APIError("FORBIDDEN", {
            code: "SIGNUP_BLOCKED",
            message: "Cette adresse ne peut pas être utilisée pour le moment.",
          });
        }
        if (ctx.path === "/email-otp/send-verification-otp") {
          const quota = await limiter.consume(`otp-email:${fingerprint}`, OTP_POLICY.perEmailPerHour, 3600);
          if (!quota.allowed) {
            throw new APIError("TOO_MANY_REQUESTS", {
              code: "OTP_EMAIL_QUOTA",
              message: "Trop de codes demandés pour cette adresse. Réessaie plus tard.",
            });
          }
        }
      }),
    },
    databaseHooks: {
      user: {
        create: {
          before: async (user, ctx) => {
            const parsed = parseSchoolEmail(user.email);
            if (!parsed.ok || parsed.canonicalEmail !== user.email) {
              throw new APIError("BAD_REQUEST", { code: "SCHOOL_EMAIL_REQUIRED" });
            }
            const [schoolRow] = await db
              .select({ id: schema.school.id })
              .from(schema.school)
              .where(eq(schema.school.slug, parsed.school.slug))
              .limit(1);
            if (!schoolRow) {
              throw new APIError("INTERNAL_SERVER_ERROR", { code: "SCHOOL_NOT_SEEDED" });
            }
            return {
              data: {
                ...user,
                name: "",
                schoolId: schoolRow.id,
                emailHmac: emailHmac(env.EMAIL_HMAC_SECRET, parsed.canonicalEmail),
                status: "onboarding",
                locale: ctx?.headers ? requestLocale(ctx.headers) : DEFAULT_LOCALE,
              },
            };
          },
        },
      },
    },
    plugins: [
      emailOTP({
        otpLength: OTP_POLICY.length,
        expiresIn: OTP_POLICY.expiresInSeconds,
        allowedAttempts: OTP_POLICY.allowedAttempts,
        storeOTP: "hashed",
        disableSignUp: options.allowSignUp === false,
        async sendVerificationOTP({ email, otp }, ctx) {
          const locale = ctx?.headers ? requestLocale(ctx.headers) : DEFAULT_LOCALE;
          // Not awaited by the caller's response path to avoid timing differences.
          void mailer
            .send(email, signInCodeEmail(otp, OTP_POLICY.expiresInSeconds / 60, locale))
            .catch(() => {
              console.error("[auth] sign-in code email could not be sent");
            });
        },
      }),
      passkey({
        rpID: env.PASSKEY_RP_ID,
        rpName: "Atomes",
        origin: env.APP_URL,
      }),
      admin({
        defaultRole: "user",
        adminRoles: ["admin"],
      }),
      ...(forgeId
        ? [
            genericOAuth({
              config: [
                {
                  providerId: FORGE_ID_PROVIDER,
                  discoveryUrl: forgeId.discoveryUrl,
                  clientId: forgeId.clientId,
                  clientSecret: forgeId.clientSecret,
                  scopes: ["openid", "email", "profile"],
                  pkce: true,
                  disableSignUp: options.allowSignUp === false,
                  mapProfileToUser: (profile) => {
                    const check = checkForgeIdProfile(profile, forgeId);
                    if (!check.ok) {
                      throw new APIError("FORBIDDEN", {
                        code: check.reason === "not_lyon" ? "FORGE_ID_NOT_LYON" : "SCHOOL_EMAIL_REQUIRED",
                      });
                    }
                    return { email: check.email, name: "", emailVerified: true };
                  },
                },
              ],
            }),
          ]
        : []),
      ...(env.TURNSTILE_SECRET_KEY
        ? [
            captcha({
              provider: "cloudflare-turnstile",
              secretKey: env.TURNSTILE_SECRET_KEY,
              endpoints: ["/email-otp/send-verification-otp"],
            }),
          ]
        : []),
    ],
  });
}

export type Auth = ReturnType<typeof createAuth>;

/**
 * Ends every session of a member, including the copies cached in Valkey
 * (account deletion, underage declaration, ban).
 */
export async function revokeAllSessions(auth: Auth, userId: string): Promise<void> {
  const context = await auth.$context;
  await context.internalAdapter.deleteUserSessions(userId);
}
