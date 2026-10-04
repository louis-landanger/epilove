import { REFERRAL_CODE_ALPHABET, REFERRAL_CODE_LENGTH, type WaitlistStats } from "@atomes/contracts";
import {
  collectiveGoalProgress,
  localizedPath,
  parseSchoolEmail,
  rankSchoolRace,
  SCHOOL_SLUGS,
  SCHOOLS,
} from "@atomes/core";
import { emailHmac } from "@atomes/crypto";
import { countWaitlistBySchool, joinWaitlist } from "@atomes/db";
import { createMailer, type Mailer, mailerConfigFromEnv, waitlistWelcomeEmail } from "@atomes/email";
import { ORPCError } from "@orpc/server";
import { os } from "../procedures";

/**
 * Unguessable referral code: 10 symbols of a 32-letter alphabet (50 bits).
 * 256 is a multiple of 32, so masking a random byte keeps the draw uniform.
 */
export function generateReferralCode(
  fillRandom: (bytes: Uint8Array<ArrayBuffer>) => Uint8Array = (bytes) => crypto.getRandomValues(bytes),
): string {
  const bytes = fillRandom(new Uint8Array(REFERRAL_CODE_LENGTH));
  let code = "";
  for (const byte of bytes) {
    code += REFERRAL_CODE_ALPHABET[byte & 31];
  }
  return code;
}

export interface WaitlistDependencies {
  readonly hmacSecret: () => string;
  /** Public origin of the site, used in the referral link (`<siteUrl>/?r=<code>`). */
  readonly siteUrl: () => string;
  readonly mailer: () => Mailer;
  /** Runs the welcome email without delaying the answer (same timing whether the address is new or not). */
  readonly runInBackground: (task: () => Promise<void>) => void;
  readonly now?: () => number;
}

const STATS_TTL_MS = 5_000;

function schoolName(slug: string): string {
  return SCHOOLS.find((school) => school.slug === slug)?.name ?? slug;
}

export function createWaitlistProcedures(dependencies: WaitlistDependencies) {
  const now = dependencies.now ?? Date.now;
  // Per-IP limits live in the web layer, which sees the client address; these
  // bound the work per email address and overall, shared by every instance (Valkey).
  let statsCache: { value: WaitlistStats; expiresAt: number } | null = null;

  return {
    join: os.waitlist.join.handler(async ({ input, context }) => {
      const parsed = parseSchoolEmail(input.email);
      if (!parsed.ok) {
        return { ok: false as const, reason: parsed.reason };
      }
      const { limiter } = context.services;
      if (!(await limiter.consume("waitlist:all", 600, 60)).allowed) {
        throw new ORPCError("TOO_MANY_REQUESTS");
      }
      const hmac = emailHmac(dependencies.hmacSecret(), parsed.canonicalEmail);
      if (!(await limiter.consume(`waitlist:email:${hmac}`, 5, 3600)).allowed) {
        throw new ORPCError("TOO_MANY_REQUESTS");
      }

      const result = await joinWaitlist(context.database(), {
        emailHmac: hmac,
        schoolSlug: parsed.school.slug,
        referrerCode: input.referralCode,
        nextReferralCode: () => generateReferralCode(),
      });

      if (result.created) {
        statsCache = null;
        const locale = input.locale ?? "fr";
        const referralUrl = new URL(
          `${localizedPath(locale, "/")}?r=${result.referralCode}`,
          dependencies.siteUrl(),
        ).toString();
        const email = waitlistWelcomeEmail({ schoolName: parsed.school.name, referralUrl, locale });
        const to = parsed.canonicalEmail;
        dependencies.runInBackground(() => dependencies.mailer().send(to, email));
      }
      // Same answer for a new and a known address.
      return { ok: true as const };
    }),

    stats: os.waitlist.stats.handler(async ({ context }) => {
      const time = now();
      if (statsCache && statsCache.expiresAt > time) {
        return statsCache.value;
      }
      const counts = await countWaitlistBySchool(context.database());
      const known = Object.fromEntries(SCHOOL_SLUGS.map((slug) => [slug, counts[slug] ?? 0]));
      const total = Object.values(known).reduce((sum, value) => sum + value, 0);
      const progress = collectiveGoalProgress(total);
      const value: WaitlistStats = {
        total,
        goal: progress.goal,
        goalRatio: progress.ratio,
        schools: rankSchoolRace(known).map((entry) => ({ ...entry, name: schoolName(entry.slug) })),
        updatedAt: new Date(time).toISOString(),
      };
      statsCache = { value, expiresAt: time + STATS_TTL_MS };
      return value;
    }),
  };
}

let sharedMailer: Mailer | undefined;

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} must be set.`);
  }
  return value;
}

export const waitlist = createWaitlistProcedures({
  hmacSecret: () => requireEnv("EMAIL_HMAC_SECRET"),
  siteUrl: () => {
    const appEnv = process.env.APP_ENV;
    // Never send a localhost referral link from production: fail loudly instead.
    return appEnv === "development" || appEnv === "test"
      ? (process.env.SITE_URL ?? "http://localhost:3000")
      : requireEnv("SITE_URL");
  },
  mailer: () => {
    sharedMailer ??= createMailer(mailerConfigFromEnv());
    return sharedMailer;
  },
  runInBackground: (task) => {
    task().catch((error: unknown) => {
      // The error message may quote the address: log its kind only.
      console.error(`[waitlist] welcome email failed: ${error instanceof Error ? error.name : "unknown"}`);
    });
  },
});
