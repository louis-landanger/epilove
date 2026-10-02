import { REFERRAL_CODE_ALPHABET, REFERRAL_CODE_LENGTH, type WaitlistStats } from "@epilove/contracts";
import {
  collectiveGoalProgress,
  localizedPath,
  parseSchoolEmail,
  rankSchoolRace,
  SCHOOL_SLUGS,
  SCHOOLS,
} from "@epilove/core";
import { emailHmac } from "@epilove/crypto";
import { countWaitlistBySchool, joinWaitlist } from "@epilove/db";
import { createMailer, type Mailer, mailerConfigFromEnv, waitlistWelcomeEmail } from "@epilove/email";
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

/**
 * Fixed-window counter kept in memory, per server process.
 * TODO(ONB-01): move to Valkey so limits hold across processes and restarts.
 */
export function createFixedWindowLimiter(options: {
  readonly limit: number;
  readonly windowMs: number;
  readonly now?: () => number;
  readonly maxKeys?: number;
}) {
  const now = options.now ?? Date.now;
  const maxKeys = options.maxKeys ?? 10_000;
  const windows = new Map<string, { start: number; count: number }>();
  return {
    /** Counts one attempt for `key`; false when the limit of the current window is exceeded. */
    take(key: string): boolean {
      const time = now();
      const current = windows.get(key);
      if (!current || time - current.start >= options.windowMs) {
        if (windows.size >= maxKeys) {
          for (const [candidate, window] of windows) {
            if (time - window.start >= options.windowMs) {
              windows.delete(candidate);
            }
          }
        }
        windows.set(key, { start: time, count: 1 });
        return true;
      }
      current.count += 1;
      return current.count <= options.limit;
    },
  };
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
  // bound the work per address and per process whatever the entry point.
  const perAddress = createFixedWindowLimiter({ limit: 5, windowMs: 60 * 60_000, now });
  const overall = createFixedWindowLimiter({ limit: 600, windowMs: 60_000, now });
  let statsCache: { value: WaitlistStats; expiresAt: number } | null = null;

  return {
    join: os.waitlist.join.handler(async ({ input, context }) => {
      const parsed = parseSchoolEmail(input.email);
      if (!parsed.ok) {
        return { ok: false as const, reason: parsed.reason };
      }
      if (!overall.take("all")) {
        throw new ORPCError("TOO_MANY_REQUESTS");
      }
      const hmac = emailHmac(dependencies.hmacSecret(), parsed.canonicalEmail);
      if (!perAddress.take(hmac)) {
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
