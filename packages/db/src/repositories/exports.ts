import { and, asc, count, desc, eq, gt, isNotNull, lt, ne } from "drizzle-orm";
import type { Database } from "../client";
import {
  appUser,
  block,
  consent,
  dataExport,
  hiddenContact,
  interest,
  moderationAction,
  photo,
  preferences,
  profile,
  profileInterest,
  prompt,
  promptAnswer,
  report,
  school,
} from "../schema";

type Db = Pick<Database, "select" | "insert" | "update" | "delete">;

export async function insertExport(db: Db, userId: string) {
  const [row] = await db.insert(dataExport).values({ userId }).returning({ id: dataExport.id });
  return row?.id ?? null;
}

export async function listExports(db: Db, userId: string) {
  return db
    .select()
    .from(dataExport)
    .where(eq(dataExport.userId, userId))
    .orderBy(desc(dataExport.createdAt))
    .limit(5);
}

export async function findExport(db: Db, id: string) {
  const [row] = await db.select().from(dataExport).where(eq(dataExport.id, id)).limit(1);
  return row ?? null;
}

export async function countRecentExports(db: Db, userId: string, since: Date) {
  const [row] = await db
    .select({ value: count() })
    .from(dataExport)
    .where(
      and(eq(dataExport.userId, userId), gt(dataExport.createdAt, since), ne(dataExport.status, "failed")),
    );
  return row?.value ?? 0;
}

export async function markExportReady(db: Db, id: string, storageKey: string, at: Date, expiresAt: Date) {
  await db
    .update(dataExport)
    .set({ status: "ready", storageKey, readyAt: at, expiresAt })
    .where(eq(dataExport.id, id));
}

export async function markExportFailed(db: Db, id: string) {
  await db.update(dataExport).set({ status: "failed" }).where(eq(dataExport.id, id));
}

export async function listExpiredExports(db: Db, now: Date) {
  return db
    .select({ id: dataExport.id, storageKey: dataExport.storageKey })
    .from(dataExport)
    .where(and(isNotNull(dataExport.expiresAt), lt(dataExport.expiresAt, now)))
    .limit(500);
}

export async function deleteExport(db: Db, id: string) {
  await db.delete(dataExport).where(eq(dataExport.id, id));
}

/**
 * Everything the member provided or that concerns them, for SAF-14. The
 * genders sought are deliberately left out (sensitive data, never exported:
 * CLAUDE.md invariants); third parties appear only as dates or hints.
 */
export async function collectPersonalData(db: Db, userId: string) {
  const [
    [account],
    [ownProfile],
    [prefs],
    answers,
    interests,
    photos,
    consents,
    blocks,
    hidden,
    reports,
    decisions,
  ] = await Promise.all([
    db
      .select({
        email: appUser.email,
        school: school.name,
        status: appUser.status,
        locale: appUser.locale,
        createdAt: appUser.createdAt,
        verifiedAt: appUser.verifiedAt,
      })
      .from(appUser)
      .innerJoin(school, eq(school.id, appUser.schoolId))
      .where(eq(appUser.id, userId)),
    db
      .select({
        firstName: profile.firstName,
        birthDate: profile.birthDate,
        gender: profile.gender,
        pronouns: profile.pronouns,
        program: profile.program,
        graduationYear: profile.graduationYear,
        languages: profile.languages,
        intentions: profile.intentions,
      })
      .from(profile)
      .where(eq(profile.userId, userId)),
    db
      .select({
        modes: preferences.modes,
        ageMin: preferences.ageMin,
        ageMax: preferences.ageMax,
        hideFromOwnSchool: preferences.hideFromOwnSchool,
        hideFromOwnYear: preferences.hideFromOwnYear,
        incognito: preferences.incognito,
        discreetNotifications: preferences.discreetNotifications,
      })
      .from(preferences)
      .where(eq(preferences.userId, userId)),
    db
      .select({ question: prompt.textFr, answer: promptAnswer.text })
      .from(promptAnswer)
      .innerJoin(prompt, eq(prompt.id, promptAnswer.promptId))
      .where(eq(promptAnswer.userId, userId))
      .orderBy(asc(promptAnswer.position)),
    db
      .select({ label: interest.labelFr })
      .from(profileInterest)
      .innerJoin(interest, eq(interest.id, profileInterest.interestId))
      .where(eq(profileInterest.userId, userId)),
    db
      .select({
        storageKey: photo.storageKey,
        stage: photo.stage,
        status: photo.status,
        altText: photo.altText,
        createdAt: photo.createdAt,
      })
      .from(photo)
      .where(eq(photo.userId, userId))
      .orderBy(asc(photo.position)),
    db
      .select({
        kind: consent.kind,
        version: consent.version,
        grantedAt: consent.grantedAt,
        withdrawnAt: consent.withdrawnAt,
      })
      .from(consent)
      .where(eq(consent.userId, userId))
      .orderBy(asc(consent.grantedAt)),
    db.select({ blockedAt: block.createdAt }).from(block).where(eq(block.blockerId, userId)),
    db
      .select({ hint: hiddenContact.hint, createdAt: hiddenContact.createdAt })
      .from(hiddenContact)
      .where(eq(hiddenContact.userId, userId)),
    db
      .select({
        reason: report.reason,
        context: report.context,
        status: report.status,
        createdAt: report.createdAt,
      })
      .from(report)
      .where(eq(report.reporterId, userId)),
    db
      .select({
        action: moderationAction.action,
        rule: moderationAction.rule,
        statement: moderationAction.statement,
        createdAt: moderationAction.createdAt,
        expiresAt: moderationAction.expiresAt,
      })
      .from(moderationAction)
      .where(and(eq(moderationAction.targetUserId, userId), ne(moderationAction.action, "no_action"))),
  ]);
  return {
    account: account ?? null,
    profile: ownProfile ?? null,
    preferences: prefs ?? null,
    prompts: answers,
    interests: interests.map((row) => row.label),
    photos,
    consents,
    blocks,
    hiddenContacts: hidden,
    reportsFiled: reports,
    decisions,
  };
}
