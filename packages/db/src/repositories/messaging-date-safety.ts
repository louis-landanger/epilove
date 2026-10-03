import type { CheckInAnswer } from "@epilove/core";
import { and, count, eq, gt, gte, isNull, sql } from "drizzle-orm";
import type { Database } from "../client";
import { dateShare, notification } from "../schema";
import { enqueue } from "./outbox";

/** Date safety kit (IRL-03): temporary links to a date's details for a trusted person. */

export type DateShareRow = typeof dateShare.$inferSelect;

/** Creates a share; with an id already used by the same member, returns the existing one (idempotent). */
export async function insertShare(
  db: Database,
  row: typeof dateShare.$inferInsert,
): Promise<{ readonly share: DateShareRow; readonly created: boolean } | null> {
  const [inserted] = await db.insert(dateShare).values(row).onConflictDoNothing().returning();
  if (inserted) {
    return { share: inserted, created: true };
  }
  const [existing] = await db.select().from(dateShare).where(eq(dateShare.id, row.id));
  return existing && existing.userId === row.userId ? { share: existing, created: false } : null;
}

export async function shareById(db: Database, id: string) {
  const [row] = await db.select().from(dateShare).where(eq(dateShare.id, id));
  return row ?? null;
}

export async function shareByTokenHash(db: Database, tokenHash: string) {
  const [row] = await db.select().from(dateShare).where(eq(dateShare.tokenHash, tokenHash));
  return row ?? null;
}

/** Links still working for this date, and links the member created since `since` (limits). */
export async function shareCounts(
  db: Database,
  input: { userId: string; messageId: string; now: Date; since: Date },
) {
  const [active] = await db
    .select({ n: count() })
    .from(dateShare)
    .where(
      and(
        eq(dateShare.userId, input.userId),
        eq(dateShare.messageId, input.messageId),
        isNull(dateShare.revokedAt),
        gt(dateShare.expiresAt, input.now),
      ),
    );
  const [recent] = await db
    .select({ n: count() })
    .from(dateShare)
    .where(and(eq(dateShare.userId, input.userId), gte(dateShare.createdAt, input.since)));
  return { activeForDate: active?.n ?? 0, createdToday: recent?.n ?? 0 };
}

/** The member's links for one date, newest first. */
export async function sharesOfDate(db: Database, userId: string, messageId: string) {
  return db
    .select()
    .from(dateShare)
    .where(and(eq(dateShare.userId, userId), eq(dateShare.messageId, messageId)))
    .orderBy(sql`${dateShare.createdAt} desc`);
}

export async function revokeShare(db: Database, id: string, userId: string, now: Date) {
  await db
    .update(dateShare)
    .set({ revokedAt: now })
    .where(and(eq(dateShare.id, id), eq(dateShare.userId, userId), isNull(dateShare.revokedAt)));
}

/** "Tout s'est bien passé ?": the latest answer wins, and every link of the same date shows it. */
export async function answerCheckIn(
  db: Database,
  input: { messageId: string; userId: string; answer: CheckInAnswer; now: Date },
) {
  await db
    .update(dateShare)
    .set({ checkInAnswer: input.answer, checkedInAt: input.now })
    .where(and(eq(dateShare.messageId, input.messageId), eq(dateShare.userId, input.userId)));
}

/**
 * Sends the check-in notification of every share whose time has come, once
 * per date (several links for the same date share one question).
 */
export async function notifyDueCheckIns(db: Database, now: Date, limit = 200): Promise<number> {
  return db.transaction(async (tx) => {
    const due = await tx
      .select({ id: dateShare.id, userId: dateShare.userId, messageId: dateShare.messageId })
      .from(dateShare)
      .where(
        and(
          isNull(dateShare.checkInNotifiedAt),
          isNull(dateShare.revokedAt),
          isNull(dateShare.checkInAnswer),
          sql`${dateShare.checkInAt} <= ${now.toISOString()}`,
          gt(dateShare.expiresAt, now),
        ),
      )
      .orderBy(dateShare.checkInAt)
      .limit(limit)
      .for("update", { skipLocked: true });
    if (due.length === 0) {
      return 0;
    }
    await tx
      .update(dateShare)
      .set({ checkInNotifiedAt: now })
      .where(sql`${dateShare.id} in ${due.map((d) => d.id)}`);
    const perDate = new Map(due.map((d) => [`${d.userId}:${d.messageId}`, d]));
    const notify = [...perDate.values()];
    await tx
      .insert(notification)
      .values(notify.map((d) => ({ userId: d.userId, type: "date_check_in", payload: { shareId: d.id } })));
    await enqueue(
      tx,
      notify.map((d) => ({ userId: d.userId, event: { type: "notification.created" as const } })),
    );
    return notify.length;
  });
}
