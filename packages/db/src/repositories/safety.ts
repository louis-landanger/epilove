import type { ReportContext, ReportPriority, ReportReason } from "@atomes/core";
import { and, count, countDistinct, desc, eq, gt, inArray, isNull, sql } from "drizzle-orm";
import type { Database } from "../client";
import { appUser, auditLog, block, hiddenContact, profile, report } from "../schema";

type Db = Pick<Database, "select" | "insert" | "update" | "delete">;

// --- Blocks (SAF-01) --------------------------------------------------------------

/** Idempotent: blocking twice keeps a single row. */
export async function insertBlock(db: Db, blockerId: string, blockedId: string) {
  await db.insert(block).values({ blockerId, blockedId }).onConflictDoNothing();
}

export async function deleteBlock(db: Db, blockerId: string, blockedId: string) {
  await db.delete(block).where(and(eq(block.blockerId, blockerId), eq(block.blockedId, blockedId)));
}

/** People the member blocked, newest first, with the first name they had (shown to the blocker only). */
export async function listBlocked(db: Db, blockerId: string) {
  return db
    .select({ userId: block.blockedId, firstName: profile.firstName, blockedAt: block.createdAt })
    .from(block)
    .leftJoin(profile, eq(profile.userId, block.blockedId))
    .where(eq(block.blockerId, blockerId))
    .orderBy(desc(block.createdAt))
    .limit(500);
}

export async function accountExists(db: Db, userId: string) {
  const [row] = await db.select({ id: appUser.id }).from(appUser).where(eq(appUser.id, userId)).limit(1);
  return Boolean(row);
}

// --- Reports (SAF-02) ------------------------------------------------------------

export interface NewReport {
  readonly reporterId: string;
  readonly reportedId: string;
  readonly context: ReportContext;
  readonly contextRef: string | null;
  readonly reason: ReportReason;
  readonly priority: ReportPriority;
  readonly details: { readonly keyId: string; readonly data: Uint8Array } | null;
}

/** The same report filed again within `since` (double tap, retry): returned instead of a duplicate. */
export async function findRecentReport(db: Db, value: Omit<NewReport, "priority" | "details">, since: Date) {
  const [row] = await db
    .select({ id: report.id })
    .from(report)
    .where(
      and(
        eq(report.reporterId, value.reporterId),
        eq(report.reportedId, value.reportedId),
        eq(report.context, value.context),
        eq(report.reason, value.reason),
        value.contextRef === null ? isNull(report.contextRef) : eq(report.contextRef, value.contextRef),
        gt(report.createdAt, since),
      ),
    )
    .limit(1);
  return row?.id ?? null;
}

export async function insertReport(db: Db, value: NewReport) {
  const [row] = await db
    .insert(report)
    .values({
      reporterId: value.reporterId,
      reportedId: value.reportedId,
      context: value.context,
      contextRef: value.contextRef,
      reason: value.reason,
      priority: value.priority,
      detailsEncrypted: value.details?.data ?? null,
      keyId: value.details?.keyId ?? null,
    })
    .returning({ id: report.id });
  if (!row) {
    throw new Error("Report insert returned nothing.");
  }
  return row.id;
}

/** Distinct members with an unresolved report of these priorities against `reportedId`. */
export async function countIndependentReporters(
  db: Db,
  reportedId: string,
  priorities: readonly ReportPriority[],
) {
  const [row] = await db
    .select({ value: countDistinct(report.reporterId) })
    .from(report)
    .where(
      and(
        eq(report.reportedId, reportedId),
        inArray(report.priority, [...priorities]),
        inArray(report.status, ["open", "in_review"]),
      ),
    );
  return row?.value ?? 0;
}

/** Hides a profile pending review. Returns true when it was not hidden yet. */
export async function holdProfile(db: Db, userId: string, at: Date) {
  const updated = await db
    .update(profile)
    .set({ hiddenAt: at })
    .where(and(eq(profile.userId, userId), isNull(profile.hiddenAt)))
    .returning({ userId: profile.userId });
  return updated.length > 0;
}

// --- Hidden contacts (SAF-04) --------------------------------------------------------

export async function listHiddenContacts(db: Db, userId: string) {
  return db
    .select({ id: hiddenContact.id, hint: hiddenContact.hint, createdAt: hiddenContact.createdAt })
    .from(hiddenContact)
    .where(eq(hiddenContact.userId, userId))
    .orderBy(desc(hiddenContact.createdAt));
}

export async function countHiddenContacts(db: Db, userId: string) {
  const [row] = await db
    .select({ value: count() })
    .from(hiddenContact)
    .where(eq(hiddenContact.userId, userId));
  return row?.value ?? 0;
}

/** Idempotent on the address fingerprint. */
export async function insertHiddenContact(db: Db, userId: string, emailHmac: string, hint: string) {
  await db.insert(hiddenContact).values({ userId, emailHmac, hint }).onConflictDoNothing();
}

export async function deleteHiddenContact(db: Db, userId: string, id: string) {
  const deleted = await db
    .delete(hiddenContact)
    .where(and(eq(hiddenContact.userId, userId), eq(hiddenContact.id, id)))
    .returning({ id: hiddenContact.id });
  return deleted.length > 0;
}

// --- Audit log ---------------------------------------------------------------------------

/**
 * Append-only trail. `metadata` holds identifiers and counts only, never
 * personal data (CLAUDE.md invariants).
 */
export async function writeAudit(
  db: Db,
  entry: {
    actorId: string | null;
    action: string;
    targetType: string;
    targetId: string | null;
    metadata?: Record<string, string | number | boolean | null>;
  },
) {
  await db.insert(auditLog).values({ ...entry, metadata: entry.metadata ?? null });
}

/**
 * SQL condition for "this user's profile can appear in discovery", for the
 * member loaders of session B: a profile exists, is not held for review, and
 * has at least one processed and approved photo.
 */
export function discoverableProfileSql(userIdColumn: typeof appUser.id) {
  return sql`exists (
    select 1 from profile p
    where p.user_id = ${userIdColumn}
      and p.hidden_at is null
      and exists (
        select 1 from photo ph
        where ph.user_id = p.user_id and ph.stage = 'ready' and ph.status = 'approved'
      )
  )`;
}
