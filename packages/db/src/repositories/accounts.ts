import type { Gender, Locale, Mode } from "@epilove/core";
import { and, desc, eq, gt, inArray, isNull, lt, sql } from "drizzle-orm";
import type { Database } from "../client";
import {
  appUser,
  type ConsentKind,
  consent,
  identityVault,
  type OnboardingDraftData,
  onboardingDraft,
  photo,
  preferences,
  profile,
  school,
  signupBlock,
} from "../schema";

type Db = Pick<Database, "select" | "insert" | "update" | "delete" | "execute">;

export async function findAccount(db: Db, userId: string) {
  const [row] = await db
    .select({
      campusVerifiedAt: appUser.campusVerifiedAt,
      reverifyDueAt: appUser.reverifyDueAt,
      pausedForReverification: appUser.pausedForReverification,
      pausedUntil: appUser.pausedUntil,
      id: appUser.id,
      email: appUser.email,
      emailHmac: appUser.emailHmac,
      status: appUser.status,
      role: appUser.role,
      schoolId: appUser.schoolId,
      schoolSlug: school.slug,
      verifiedAt: appUser.verifiedAt,
      locale: appUser.locale,
    })
    .from(appUser)
    .innerJoin(school, eq(school.id, appUser.schoolId))
    .where(eq(appUser.id, userId))
    .limit(1);
  return row ?? null;
}

/** Interface and email language (PLT-04). */
export async function setAccountLocale(db: Db, userId: string, locale: Locale) {
  await db.update(appUser).set({ locale }).where(eq(appUser.id, userId));
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

// --- Pause and deletion (SAF-05, SAF-14) -------------------------------------------------

/** Moves an account from one status to another; false when it was not in `from` any more. */
export async function transitionStatus(
  db: Db,
  userId: string,
  from: "active" | "paused",
  to: "active" | "paused",
  pausedUntil: Date | null = null,
): Promise<boolean> {
  const updated = await db
    .update(appUser)
    .set({ status: to, pausedUntil: to === "paused" ? pausedUntil : null })
    .where(and(eq(appUser.id, userId), eq(appUser.status, from)))
    .returning({ id: appUser.id });
  return updated.length > 0;
}

/**
 * Starts the deletion of an account: status `deleting` (invisible at once),
 * declared identity copied to the legal vault. Content is purged later by
 * the `accounts/purge` job.
 */
export async function requestAccountDeletion(db: Db, userId: string, at: Date, vaultPurgeAfter: Date) {
  const [account] = await db
    .select({ email: appUser.email, status: appUser.status })
    .from(appUser)
    .where(eq(appUser.id, userId))
    .limit(1);
  if (!account || account.status === "deleting") {
    return false;
  }
  const [identity] = await db
    .select({ firstName: profile.firstName, birthDate: profile.birthDate })
    .from(profile)
    .where(eq(profile.userId, userId))
    .limit(1);
  await db.insert(identityVault).values({
    formerUserId: userId,
    email: account.email,
    firstName: identity?.firstName ?? null,
    birthDate: identity?.birthDate ?? null,
    closedAt: at,
    purgeAfter: vaultPurgeAfter,
  });
  await db.update(appUser).set({ status: "deleting", deletionRequestedAt: at }).where(eq(appUser.id, userId));
  return true;
}

/** Accounts whose deletion grace period is over. */
export async function listAccountsToPurge(db: Db, requestedBefore: Date) {
  return db
    .select({ id: appUser.id })
    .from(appUser)
    .where(and(eq(appUser.status, "deleting"), lt(appUser.deletionRequestedAt, requestedBefore)))
    .limit(200);
}

export async function listStorageKeys(db: Db, userId: string) {
  const rows = await db.select({ key: photo.storageKey }).from(photo).where(eq(photo.userId, userId));
  return rows.map((row) => row.key);
}

/** Final erasure: every row referencing the account cascades or is set to null (reports). */
export async function deleteAccountRow(db: Db, userId: string) {
  await db.delete(appUser).where(and(eq(appUser.id, userId), eq(appUser.status, "deleting")));
}

export async function purgeExpiredIdentities(db: Db, now: Date) {
  const deleted = await db
    .delete(identityVault)
    .where(lt(identityVault.purgeAfter, now))
    .returning({ id: identityVault.id });
  return deleted.length;
}

export async function purgeExpiredSignupBlocks(db: Db, today: string) {
  const deleted = await db
    .delete(signupBlock)
    .where(lt(signupBlock.until, today))
    .returning({ emailHmac: signupBlock.emailHmac });
  return deleted.length;
}

/** Scheduled pauses that are over (SAF-08): the members come back automatically. */
export async function resumeScheduledPauses(db: Db, now: Date) {
  const resumed = await db
    .update(appUser)
    .set({ status: "active", pausedUntil: null })
    .where(and(eq(appUser.status, "paused"), lt(appUser.pausedUntil, now)))
    .returning({ id: appUser.id });
  return resumed.length;
}

// --- Yearly re-verification (ONB-09) -------------------------------------------------------

/**
 * Records a sign-in with a code sent to the school address. During the
 * re-verification window it moves the deadline to next year and lifts a
 * pause caused by a missed re-verification.
 */
export async function recordEmailProof(db: Db, userId: string, at: Date, nextDue: Date) {
  const [account] = await db
    .select({ reverifyDueAt: appUser.reverifyDueAt, paused: appUser.pausedForReverification })
    .from(appUser)
    .where(eq(appUser.id, userId))
    .limit(1);
  if (!account) {
    return;
  }
  // The window opens 30 days before the deadline (1 September for a 1 October deadline).
  const inWindow =
    account.reverifyDueAt !== null && at.getTime() >= account.reverifyDueAt.getTime() - 30 * 86_400_000;
  await db
    .update(appUser)
    .set({
      emailProvenAt: at,
      ...(inWindow ? { reverifyDueAt: nextDue, reverifyRemindedAt: null } : {}),
      ...(inWindow && account.paused ? { status: "active", pausedForReverification: false } : {}),
    })
    .where(eq(appUser.id, userId));
}

/** Members whose window is open, not reminded in the last `remindEvery`. */
export async function listReverificationReminders(db: Db, today: Date, horizon: Date, remindedBefore: Date) {
  return db
    .select({
      id: appUser.id,
      email: appUser.email,
      locale: appUser.locale,
      reverifyDueAt: appUser.reverifyDueAt,
    })
    .from(appUser)
    .where(
      and(
        inArray(appUser.status, ["active", "restricted", "paused"]),
        lt(appUser.reverifyDueAt, horizon),
        gt(appUser.reverifyDueAt, today),
        sql`(${appUser.reverifyRemindedAt} is null or ${appUser.reverifyRemindedAt} < ${remindedBefore.toISOString()})`,
      ),
    )
    .limit(1000);
}

export async function markReminded(db: Db, userId: string, at: Date) {
  await db.update(appUser).set({ reverifyRemindedAt: at }).where(eq(appUser.id, userId));
}

/** Pauses members past their deadline (the next proof brings them back). */
export async function pauseOverdueReverifications(db: Db, now: Date) {
  const paused = await db
    .update(appUser)
    .set({ status: "paused", pausedForReverification: true, pausedUntil: null })
    .where(and(inArray(appUser.status, ["active", "restricted"]), lt(appUser.reverifyDueAt, now)))
    .returning({ id: appUser.id });
  return paused.length;
}

/** Forge ID confirmed a student of the Lyon campus (ONB-11). */
export async function markCampusVerified(db: Db, userId: string, at: Date) {
  await db.update(appUser).set({ campusVerifiedAt: at }).where(eq(appUser.id, userId));
}
