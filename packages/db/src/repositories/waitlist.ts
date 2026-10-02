import { count, eq, inArray } from "drizzle-orm";
import type { Database } from "../client";
import { school } from "../schema/campus";
import { waitlistEntry } from "../schema/users";

export interface JoinWaitlistParams {
  /** HMAC of the canonical school email: the address itself is never stored. */
  readonly emailHmac: string;
  readonly schoolSlug: string;
  /** Code of the referral link the person came from, if any. Unknown codes are ignored. */
  readonly referrerCode?: string | undefined;
  /** Generates a fresh referral code; called again if a code is already taken. */
  readonly nextReferralCode: () => string;
}

export type JoinWaitlistResult =
  | { readonly created: true; readonly referralCode: string }
  | { readonly created: false };

const MAX_CODE_ATTEMPTS = 5;

function isUniqueViolation(error: unknown, constraint: string): boolean {
  // postgres-js errors may come wrapped by Drizzle (DrizzleQueryError.cause).
  for (let current: unknown = error; current instanceof Error; current = current.cause) {
    const details = current as Error & { code?: string; constraint_name?: string };
    if (details.code === "23505" && details.constraint_name === constraint) {
      return true;
    }
  }
  return false;
}

/**
 * Adds a person to the waiting list (ONB-01). Idempotent: a second call with
 * the same HMAC changes nothing and reports `created: false`, so the caller
 * can send the welcome email only once. Concurrent calls are safe: the unique
 * index on `email_hmac` decides.
 */
export async function joinWaitlist(db: Database, params: JoinWaitlistParams): Promise<JoinWaitlistResult> {
  const [target] = await db
    .select({ id: school.id })
    .from(school)
    .where(eq(school.slug, params.schoolSlug))
    .limit(1);
  if (!target) {
    throw new Error("Unknown school: the reference data must be seeded.");
  }

  let referredBy: string | null = null;
  if (params.referrerCode) {
    const [referrer] = await db
      .select({ id: waitlistEntry.id })
      .from(waitlistEntry)
      .where(eq(waitlistEntry.referralCode, params.referrerCode))
      .limit(1);
    referredBy = referrer?.id ?? null;
  }

  for (let attempt = 1; ; attempt += 1) {
    const referralCode = params.nextReferralCode();
    try {
      const [inserted] = await db
        .insert(waitlistEntry)
        .values({ emailHmac: params.emailHmac, schoolId: target.id, referralCode, referredBy })
        .onConflictDoNothing({ target: waitlistEntry.emailHmac })
        .returning({ referralCode: waitlistEntry.referralCode });
      return inserted ? { created: true, referralCode: inserted.referralCode } : { created: false };
    } catch (error) {
      if (attempt < MAX_CODE_ATTEMPTS && isUniqueViolation(error, "waitlist_entry_referralCode_unique")) {
        continue;
      }
      throw error;
    }
  }
}

/** The entry of an address, by HMAC (for example to grant the "Fondateur" badge at sign-up). */
export async function findWaitlistEntry(db: Database, emailHmac: string) {
  const [entry] = await db
    .select()
    .from(waitlistEntry)
    .where(eq(waitlistEntry.emailHmac, emailHmac))
    .limit(1);
  return entry;
}

/** Erases entries by HMAC (right to erasure, test clean-up). Returns the number of rows removed. */
export async function deleteWaitlistEntries(db: Database, emailHmacs: readonly string[]): Promise<number> {
  if (emailHmacs.length === 0) {
    return 0;
  }
  const removed = await db
    .delete(waitlistEntry)
    .where(inArray(waitlistEntry.emailHmac, [...emailHmacs]))
    .returning({ id: waitlistEntry.id });
  return removed.length;
}

/** Number of people on the waiting list per school slug (schools without sign-ups count zero). */
export async function countWaitlistBySchool(db: Database): Promise<Record<string, number>> {
  const rows = await db
    .select({ slug: school.slug, count: count(waitlistEntry.id) })
    .from(school)
    .leftJoin(waitlistEntry, eq(waitlistEntry.schoolId, school.id))
    .groupBy(school.slug);
  return Object.fromEntries(rows.map((row) => [row.slug, Number(row.count)]));
}
