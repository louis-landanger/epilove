import { and, asc, count, countDistinct, desc, eq, inArray, isNotNull, lt, ne, sql } from "drizzle-orm";
import type { Database } from "../client";
import {
  appeal,
  appUser,
  auditLog,
  block,
  interest,
  moderationAction,
  photo,
  profile,
  prompt,
  promptAnswer,
  report,
  school,
} from "../schema";

type Db = Pick<Database, "select" | "insert" | "update" | "delete">;

// --- Overview -----------------------------------------------------------------------

export async function moderationOverview(db: Db) {
  const [[photos], reports, [held]] = await Promise.all([
    db
      .select({ value: count() })
      .from(photo)
      .where(and(eq(photo.stage, "ready"), eq(photo.status, "pending"))),
    db
      .select({ priority: report.priority, value: count() })
      .from(report)
      .where(inArray(report.status, ["open", "in_review"]))
      .groupBy(report.priority),
    db.select({ value: count() }).from(profile).where(isNotNull(profile.hiddenAt)),
  ]);
  const byPriority = Object.fromEntries(reports.map((row) => [row.priority, row.value]));
  return {
    pendingPhotos: photos?.value ?? 0,
    openReports: { p1: byPriority.p1 ?? 0, p2: byPriority.p2 ?? 0, p3: byPriority.p3 ?? 0 },
    heldProfiles: held?.value ?? 0,
  };
}

// --- Photo queue (ADM-01) ---------------------------------------------------------------

export async function listPendingPhotos(db: Db, options: { after?: Date; limit: number }) {
  const where = and(
    eq(photo.stage, "ready"),
    eq(photo.status, "pending"),
    options.after ? sql`${photo.createdAt} > ${options.after.toISOString()}` : undefined,
  );
  const [rows, [total]] = await Promise.all([
    db
      .select({
        id: photo.id,
        userId: photo.userId,
        storageKey: photo.storageKey,
        width: photo.width,
        height: photo.height,
        position: photo.position,
        createdAt: photo.createdAt,
      })
      .from(photo)
      .where(where)
      .orderBy(asc(photo.createdAt))
      .limit(options.limit),
    db
      .select({ value: count() })
      .from(photo)
      .where(and(eq(photo.stage, "ready"), eq(photo.status, "pending"))),
  ]);
  return { rows, total: total?.value ?? 0 };
}

export async function findPhotoForModeration(db: Db, photoId: string) {
  const [row] = await db
    .select({ id: photo.id, userId: photo.userId, status: photo.status, stage: photo.stage })
    .from(photo)
    .where(eq(photo.id, photoId))
    .limit(1);
  return row ?? null;
}

export async function setPhotoDecision(
  db: Db,
  photoId: string,
  status: "approved" | "rejected",
  moderation: Record<string, string>,
) {
  await db.update(photo).set({ status, moderation }).where(eq(photo.id, photoId));
}

// --- Reports (ADM-02) ---------------------------------------------------------------------

const PRIORITY_ORDER = sql`case ${report.priority} when 'p1' then 1 when 'p2' then 2 else 3 end`;

export async function listReports(
  db: Db,
  options: { status: "open" | "in_review" | "resolved" | "dismissed"; before?: Date; limit: number },
) {
  const open = options.status === "open" || options.status === "in_review";
  return (
    db
      .select({
        id: report.id,
        priority: report.priority,
        reason: report.reason,
        context: report.context,
        status: report.status,
        createdAt: report.createdAt,
        reportedId: report.reportedId,
      })
      .from(report)
      .where(
        and(
          eq(report.status, options.status),
          options.before ? lt(report.createdAt, options.before) : undefined,
        ),
      )
      // Open reports: most serious first, then oldest first. Closed ones: newest first.
      .orderBy(...(open ? [PRIORITY_ORDER, asc(report.createdAt)] : [desc(report.createdAt)]))
      .limit(options.limit)
  );
}

export async function findReport(db: Db, id: string) {
  const [row] = await db.select().from(report).where(eq(report.id, id)).limit(1);
  return row ?? null;
}

export async function setReportStatus(
  db: Db,
  id: string,
  status: "in_review" | "resolved" | "dismissed",
  moderatorId: string,
  at: Date,
) {
  await db
    .update(report)
    .set({
      status,
      assignedTo: moderatorId,
      resolvedAt: status === "in_review" ? null : at,
    })
    .where(eq(report.id, id));
}

export async function countOpenSeriousReports(db: Db, reportedId: string, excludeId: string) {
  const [row] = await db
    .select({ value: count() })
    .from(report)
    .where(
      and(
        eq(report.reportedId, reportedId),
        inArray(report.status, ["open", "in_review"]),
        inArray(report.priority, ["p1", "p2"]),
        ne(report.id, excludeId),
      ),
    );
  return row?.value ?? 0;
}

// --- Members (pseudonymised view) -----------------------------------------------------------

export async function memberForModeration(db: Db, userId: string) {
  const [account] = await db
    .select({
      id: appUser.id,
      status: appUser.status,
      createdAt: appUser.createdAt,
      schoolSlug: school.slug,
      birthDate: profile.birthDate,
      graduationYear: profile.graduationYear,
      hiddenAt: profile.hiddenAt,
    })
    .from(appUser)
    .innerJoin(school, eq(school.id, appUser.schoolId))
    .leftJoin(profile, eq(profile.userId, appUser.id))
    .where(eq(appUser.id, userId))
    .limit(1);
  if (!account) {
    return null;
  }
  const [photos, prompts, [reports], [blocks], actions] = await Promise.all([
    db
      .select({ id: photo.id, storageKey: photo.storageKey, status: photo.status, stage: photo.stage })
      .from(photo)
      .where(and(eq(photo.userId, userId), ne(photo.stage, "failed")))
      .orderBy(asc(photo.position)),
    db
      .select({ question: prompt.textFr, answer: promptAnswer.text })
      .from(promptAnswer)
      .innerJoin(prompt, eq(prompt.id, promptAnswer.promptId))
      .where(eq(promptAnswer.userId, userId))
      .orderBy(asc(promptAnswer.position)),
    db
      .select({ total: count(), reporters: countDistinct(report.reporterId) })
      .from(report)
      .where(eq(report.reportedId, userId)),
    db.select({ value: count() }).from(block).where(eq(block.blockedId, userId)),
    db
      .select({
        action: moderationAction.action,
        rule: moderationAction.rule,
        createdAt: moderationAction.createdAt,
        expiresAt: moderationAction.expiresAt,
      })
      .from(moderationAction)
      .where(eq(moderationAction.targetUserId, userId))
      .orderBy(desc(moderationAction.createdAt))
      .limit(20),
  ]);
  return {
    account,
    photos,
    prompts,
    reportsReceived: reports?.total ?? 0,
    distinctReporters: reports?.reporters ?? 0,
    blocksReceived: blocks?.value ?? 0,
    actions,
  };
}

export async function identityOf(db: Db, userId: string) {
  const [row] = await db
    .select({ email: appUser.email, firstName: profile.firstName, locale: appUser.locale })
    .from(appUser)
    .leftJoin(profile, eq(profile.userId, appUser.id))
    .where(eq(appUser.id, userId))
    .limit(1);
  return row ?? null;
}

// --- Decisions (ADM-03) -----------------------------------------------------------------------

export async function insertModerationAction(
  db: Db,
  values: {
    reportId: string;
    targetUserId: string | null;
    moderatorId: string;
    action: "no_action" | "warning" | "content_removal" | "restriction" | "suspension" | "ban";
    rule: string;
    statement: string;
    expiresAt: Date | null;
  },
) {
  const [row] = await db.insert(moderationAction).values(values).returning({ id: moderationAction.id });
  return row?.id ?? null;
}

export async function applyAccountSanction(
  db: Db,
  userId: string,
  status: "restricted" | "suspended" | "banned" | null,
) {
  if (!status) {
    return;
  }
  await db
    .update(appUser)
    .set({ status })
    .where(and(eq(appUser.id, userId), ne(appUser.status, "deleting")));
}

export async function releaseProfileHold(db: Db, userId: string) {
  await db.update(profile).set({ hiddenAt: null }).where(eq(profile.userId, userId));
}

/** Restrictions and suspensions whose last decision has lapsed. */
export async function listLapsedSanctions(db: Db, now: Date) {
  return db
    .select({ userId: appUser.id })
    .from(appUser)
    .where(
      and(
        inArray(appUser.status, ["restricted", "suspended"]),
        sql`(
          select max(${moderationAction.expiresAt}) from ${moderationAction}
          where ${moderationAction.targetUserId} = ${appUser.id}
            and ${moderationAction.action} in ('restriction', 'suspension')
        ) < ${now.toISOString()}`,
      ),
    )
    .limit(500);
}

export async function reinstate(db: Db, userId: string) {
  await db
    .update(appUser)
    .set({ status: "active" })
    .where(and(eq(appUser.id, userId), inArray(appUser.status, ["restricted", "suspended"])));
}

// --- Audit log (ADM-05) ---------------------------------------------------------------------------

export async function listAudit(db: Db, options: { before?: Date; limit: number }) {
  return db
    .select()
    .from(auditLog)
    .where(options.before ? lt(auditLog.createdAt, options.before) : undefined)
    .orderBy(desc(auditLog.createdAt))
    .limit(options.limit);
}

// --- Catalogues (ADM-06) -----------------------------------------------------------------------------

export async function listCatalog(db: Db) {
  const [prompts, interests] = await Promise.all([
    db.select().from(prompt).orderBy(asc(prompt.category), asc(prompt.slug)),
    db.select().from(interest).orderBy(asc(interest.category), asc(interest.slug)),
  ]);
  return { prompts, interests };
}

export async function savePrompt(
  db: Db,
  values: { id?: string; slug: string; category: string; textFr: string; textEn: string; active: boolean },
) {
  const { id, ...fields } = values;
  const [row] = id
    ? await db.update(prompt).set(fields).where(eq(prompt.id, id)).returning()
    : await db.insert(prompt).values(fields).returning();
  return row ?? null;
}

export async function saveInterest(
  db: Db,
  values: { id?: string; slug: string; category: string; labelFr: string; labelEn: string },
) {
  const { id, ...fields } = values;
  const [row] = id
    ? await db.update(interest).set(fields).where(eq(interest.id, id)).returning()
    : await db.insert(interest).values(fields).returning();
  return row ?? null;
}

// --- Appeals (ADM-04) ----------------------------------------------------------------------------

/** The member's own decisions (statement included), with their appeal if any. */
export async function listDecisionsFor(db: Db, userId: string) {
  return db
    .select({
      id: moderationAction.id,
      action: moderationAction.action,
      rule: moderationAction.rule,
      statement: moderationAction.statement,
      createdAt: moderationAction.createdAt,
      expiresAt: moderationAction.expiresAt,
      appealStatus: appeal.status,
    })
    .from(moderationAction)
    .leftJoin(appeal, eq(appeal.actionId, moderationAction.id))
    .where(and(eq(moderationAction.targetUserId, userId), ne(moderationAction.action, "no_action")))
    .orderBy(desc(moderationAction.createdAt))
    .limit(50);
}

export async function findDecision(db: Db, actionId: string) {
  const [row] = await db
    .select({
      id: moderationAction.id,
      targetUserId: moderationAction.targetUserId,
      moderatorId: moderationAction.moderatorId,
      action: moderationAction.action,
      rule: moderationAction.rule,
      statement: moderationAction.statement,
      createdAt: moderationAction.createdAt,
      expiresAt: moderationAction.expiresAt,
      reportId: moderationAction.reportId,
    })
    .from(moderationAction)
    .where(eq(moderationAction.id, actionId))
    .limit(1);
  return row ?? null;
}

export async function hasAppeal(db: Db, actionId: string) {
  const [row] = await db.select({ id: appeal.id }).from(appeal).where(eq(appeal.actionId, actionId)).limit(1);
  return Boolean(row);
}

export async function insertAppeal(db: Db, actionId: string, text: string) {
  const [row] = await db.insert(appeal).values({ actionId, text }).returning({ id: appeal.id });
  return row?.id ?? null;
}

export async function listPendingAppeals(db: Db) {
  return db
    .select({
      id: appeal.id,
      createdAt: appeal.createdAt,
      action: moderationAction.action,
      rule: moderationAction.rule,
      targetUserId: moderationAction.targetUserId,
    })
    .from(appeal)
    .innerJoin(moderationAction, eq(moderationAction.id, appeal.actionId))
    .where(eq(appeal.status, "pending"))
    .orderBy(asc(appeal.createdAt))
    .limit(100);
}

export async function findAppeal(db: Db, id: string) {
  const [row] = await db
    .select({
      id: appeal.id,
      text: appeal.text,
      status: appeal.status,
      createdAt: appeal.createdAt,
      actionId: appeal.actionId,
    })
    .from(appeal)
    .where(eq(appeal.id, id))
    .limit(1);
  return row ?? null;
}

export async function setAppealOutcome(
  db: Db,
  id: string,
  status: "upheld" | "overturned",
  reviewerId: string,
  at: Date,
) {
  const updated = await db
    .update(appeal)
    .set({ status, reviewerId, decidedAt: at })
    .where(and(eq(appeal.id, id), eq(appeal.status, "pending")))
    .returning({ id: appeal.id });
  return updated.length > 0;
}

/** Undoes the status set by an overturned decision, if it is still the current one. */
export async function revertSanctionStatus(
  db: Db,
  userId: string,
  status: "restricted" | "suspended" | "banned",
) {
  await db
    .update(appUser)
    .set({ status: "active" })
    .where(and(eq(appUser.id, userId), eq(appUser.status, status)));
}

export async function endSanctionNow(db: Db, actionId: string, at: Date) {
  await db.update(moderationAction).set({ expiresAt: at }).where(eq(moderationAction.id, actionId));
}
