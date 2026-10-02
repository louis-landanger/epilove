import type { Gender, Mode } from "@epilove/core";
import { and, desc, eq, gt, isNull, sql } from "drizzle-orm";
import type { Database } from "../client";
import {
  appUser,
  type ConsentKind,
  consent,
  type OnboardingDraftData,
  onboardingDraft,
  preferences,
  profile,
  school,
  signupBlock,
} from "../schema";

type Db = Pick<Database, "select" | "insert" | "update" | "delete" | "execute">;

export async function findAccount(db: Db, userId: string) {
  const [row] = await db
    .select({
      id: appUser.id,
      email: appUser.email,
      emailHmac: appUser.emailHmac,
      status: appUser.status,
      role: appUser.role,
      schoolId: appUser.schoolId,
      schoolSlug: school.slug,
      verifiedAt: appUser.verifiedAt,
    })
    .from(appUser)
    .innerJoin(school, eq(school.id, appUser.schoolId))
    .where(eq(appUser.id, userId))
    .limit(1);
  return row ?? null;
}

// --- Onboarding draft ------------------------------------------------------------

export async function readOnboardingDraft(db: Db, userId: string): Promise<OnboardingDraftData> {
  const [row] = await db
    .select({ data: onboardingDraft.data })
    .from(onboardingDraft)
    .where(eq(onboardingDraft.userId, userId))
    .limit(1);
  return row?.data ?? {};
}

/** Merges `patch` into the draft (`null` values are kept: they clear an optional field). */
export async function mergeOnboardingDraft(db: Db, userId: string, patch: OnboardingDraftData) {
  await db
    .insert(onboardingDraft)
    .values({ userId, data: patch })
    .onConflictDoUpdate({
      target: onboardingDraft.userId,
      set: {
        data: sql`${onboardingDraft.data} || ${JSON.stringify(patch)}::jsonb`,
        updatedAt: new Date(),
      },
    });
}

export async function deleteOnboardingDraft(db: Db, userId: string) {
  await db.delete(onboardingDraft).where(eq(onboardingDraft.userId, userId));
}

// --- Consents (GDPR art. 7: versioned proof) ----------------------------------------

/** The current, non-withdrawn consent of each kind. */
export async function activeConsents(db: Db, userId: string) {
  const rows = await db
    .select({ kind: consent.kind, version: consent.version, grantedAt: consent.grantedAt })
    .from(consent)
    .where(and(eq(consent.userId, userId), isNull(consent.withdrawnAt)))
    .orderBy(desc(consent.grantedAt));
  const byKind = new Map<ConsentKind, { version: string; grantedAt: Date }>();
  for (const row of rows) {
    if (!byKind.has(row.kind)) {
      byKind.set(row.kind, { version: row.version, grantedAt: row.grantedAt });
    }
  }
  return byKind;
}

/** Records a consent unless the same version is already active (idempotent). */
export async function grantConsent(db: Db, userId: string, kind: ConsentKind, version: string) {
  const [existing] = await db
    .select({ id: consent.id })
    .from(consent)
    .where(
      and(
        eq(consent.userId, userId),
        eq(consent.kind, kind),
        eq(consent.version, version),
        isNull(consent.withdrawnAt),
      ),
    )
    .limit(1);
  if (!existing) {
    await db.insert(consent).values({ userId, kind, version });
  }
}

export async function withdrawConsent(db: Db, userId: string, kind: ConsentKind) {
  await db
    .update(consent)
    .set({ withdrawnAt: new Date() })
    .where(and(eq(consent.userId, userId), eq(consent.kind, kind), isNull(consent.withdrawnAt)));
}

// --- Preferences ---------------------------------------------------------------------

export async function readPreferences(db: Db, userId: string) {
  const [row] = await db
    .select({
      modes: preferences.modes,
      interestedIn: preferences.interestedIn,
      ageMin: preferences.ageMin,
      ageMax: preferences.ageMax,
      updatedAt: preferences.updatedAt,
      createdAt: preferences.createdAt,
    })
    .from(preferences)
    .where(eq(preferences.userId, userId))
    .limit(1);
  if (!row) {
    return null;
  }
  return {
    ...row,
    modes: row.modes as Mode[],
    interestedIn: row.interestedIn as Gender[],
  };
}

export async function upsertPreferences(
  db: Db,
  userId: string,
  values: Partial<{ modes: Mode[]; interestedIn: Gender[]; ageMin: number; ageMax: number }>,
) {
  await db
    .insert(preferences)
    .values({ userId, ...values })
    .onConflictDoUpdate({ target: preferences.userId, set: { ...values, updatedAt: new Date() } });
}

// --- Activation -----------------------------------------------------------------------

export interface NewProfile {
  readonly firstName: string;
  readonly birthDate: string;
  readonly gender: Gender;
  readonly pronouns: string | null;
  readonly program: string | null;
  readonly graduationYear: number;
  readonly intentions: string[];
  readonly completeness: number;
}

/**
 * Creates the profile and activates the account. Only an account still in
 * onboarding is activated: calling it twice is harmless.
 */
export async function activateAccount(
  db: Db,
  userId: string,
  values: { profile: NewProfile; verifiedAt: Date; reverifyDueAt: Date },
): Promise<boolean> {
  const updated = await db
    .update(appUser)
    .set({
      status: "active",
      name: values.profile.firstName,
      verifiedAt: values.verifiedAt,
      reverifyDueAt: values.reverifyDueAt,
      lastActiveAt: values.verifiedAt,
    })
    .where(and(eq(appUser.id, userId), eq(appUser.status, "onboarding")))
    .returning({ id: appUser.id });
  if (updated.length === 0) {
    return false;
  }
  await db
    .insert(profile)
    .values({ userId, ...values.profile })
    .onConflictDoUpdate({ target: profile.userId, set: { ...values.profile, updatedAt: new Date() } });
  return true;
}

// --- Underage sign-ups (ONB-04) -----------------------------------------------------------

export async function isSignupBlocked(db: Db, emailHmac: string, today: string) {
  const [row] = await db
    .select({ until: signupBlock.until })
    .from(signupBlock)
    .where(and(eq(signupBlock.emailHmac, emailHmac), gt(signupBlock.until, today)))
    .limit(1);
  return Boolean(row);
}

/**
 * Deletes an account whose holder declared being under 18. Nothing about the
 * person is kept except the HMAC of the address, until their 18th birthday,
 * so the same address cannot simply retry with another date.
 */
export async function deleteUnderageAccount(db: Db, userId: string, emailHmac: string, until: string) {
  await db
    .insert(signupBlock)
    .values({ emailHmac, reason: "underage", until })
    .onConflictDoUpdate({ target: signupBlock.emailHmac, set: { until } });
  await db.delete(appUser).where(eq(appUser.id, userId));
}
