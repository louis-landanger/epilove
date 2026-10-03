import { and, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import type { Database } from "../client";
import { appUser, match, message, messageRead, notification } from "../schema";
import { enqueue } from "./outbox";

/** Matches of a member (CHAT-01, CHAT-13). Callers check `canMessage` / `canViewProfile` per match. */

export interface MatchRow {
  readonly id: string;
  readonly otherId: string;
  readonly mode: "love" | "friends";
  readonly source: string;
  readonly createdAt: Date;
  readonly lastMessageAt: Date | null;
  readonly unread: number;
}

/** Active matches, most recent activity first. */
export async function activeMatchesOf(db: Database, userId: string): Promise<MatchRow[]> {
  const rows = await db
    .select({
      id: match.id,
      userLow: match.userLow,
      userHigh: match.userHigh,
      mode: match.mode,
      source: match.source,
      createdAt: match.createdAt,
      lastMessageAt: match.lastMessageAt,
    })
    .from(match)
    .where(and(eq(match.status, "active"), or(eq(match.userLow, userId), eq(match.userHigh, userId))))
    .orderBy(desc(sql`coalesce(${match.lastMessageAt}, ${match.createdAt})`));
  const unread = await unreadCounts(
    db,
    userId,
    rows.map((r) => r.id),
  );
  return rows.map((r) => ({
    id: r.id,
    otherId: r.userLow === userId ? r.userHigh : r.userLow,
    mode: r.mode,
    source: r.source,
    createdAt: r.createdAt,
    lastMessageAt: r.lastMessageAt,
    unread: unread.get(r.id) ?? 0,
  }));
}

/**
 * Messages from the other member after the last one this member read, per
 * match. A join, not a correlated subquery: in a single-table select, Drizzle
 * leaves column names unqualified, and `"id"` would point at the message.
 */
async function unreadCounts(db: Database, userId: string, matchIds: readonly string[]) {
  if (matchIds.length === 0) {
    return new Map<string, number>();
  }
  const rows = await db
    .select({ matchId: message.matchId, unread: sql<number>`count(*)::int` })
    .from(message)
    .leftJoin(messageRead, and(eq(messageRead.matchId, message.matchId), eq(messageRead.userId, userId)))
    .where(
      and(
        inArray(message.matchId, [...matchIds]),
        sql`${message.senderId} is distinct from ${userId}`,
        isNull(message.deletedAt),
        sql`${message.id} > coalesce(${messageRead.lastReadMessageId}, '00000000-0000-0000-0000-000000000000'::uuid)`,
      ),
    )
    .groupBy(message.matchId);
  return new Map(rows.map((r) => [r.matchId, r.unread]));
}

/** A match the member takes part in (active or not), or null. */
export async function matchForMember(db: Database, matchId: string, userId: string) {
  const [row] = await db
    .select()
    .from(match)
    .where(and(eq(match.id, matchId), or(eq(match.userLow, userId), eq(match.userHigh, userId))));
  if (!row) {
    return null;
  }
  return { ...row, otherId: row.userLow === userId ? row.userHigh : row.userLow };
}

/**
 * Ends a match for both members (CHAT-13). The conversation closes at once;
 * messages are purged later by the retention job (docs/08, section 3.4).
 * Idempotent.
 */
export async function unmatch(db: Database, matchId: string, userId: string): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [updated] = await tx
      .update(match)
      .set({ status: "unmatched", unmatchedBy: userId })
      .where(
        and(
          eq(match.id, matchId),
          eq(match.status, "active"),
          or(eq(match.userLow, userId), eq(match.userHigh, userId)),
        ),
      )
      .returning({ userLow: match.userLow, userHigh: match.userHigh });
    if (!updated) {
      return false;
    }
    // Both members' screens close the conversation; the other member is not told who ended it.
    await enqueue(tx, [
      { userId: updated.userLow, event: { type: "match.closed", matchId } },
      { userId: updated.userHigh, event: { type: "match.closed", matchId } },
    ]);
    await tx
      .delete(notification)
      .where(
        and(
          or(eq(notification.userId, updated.userLow), eq(notification.userId, updated.userHigh)),
          sql`${notification.payload}->>'matchId' = ${matchId}`,
        ),
      );
    return true;
  });
}

/**
 * Active matches silent for `silenceDays` and not nudged since their last
 * activity (CHAT-09). The caller checks the access policies.
 */
export async function matchesToNudge(db: Database, now: Date, silenceDays: number, limit = 500) {
  const activity = sql`coalesce(${match.lastMessageAt}, ${match.createdAt})`;
  const cutoff = new Date(now.getTime() - silenceDays * 86_400_000).toISOString();
  return db
    .select({ id: match.id, userLow: match.userLow, userHigh: match.userHigh })
    .from(match)
    .where(
      and(
        eq(match.status, "active"),
        sql`${activity} <= ${cutoff}::timestamptz`,
        sql`(${match.nudgedAt} is null or ${match.nudgedAt} < ${activity})`,
      ),
    )
    .limit(limit);
}

/** Marks the matches nudged and notifies both members of each (one grouped notification per conversation). */
export async function recordNudges(
  db: Database,
  matches: readonly { id: string; members: readonly string[] }[],
  now: Date,
) {
  if (matches.length === 0) {
    return;
  }
  await db.transaction(async (tx) => {
    // Members first, as account deletion does (no deadlock): an account
    // deleted since the matches were picked drops its match from the batch
    // instead of failing everyone's nudges on the foreign key.
    const present = await tx
      .select({ id: appUser.id })
      .from(appUser)
      .where(inArray(appUser.id, [...new Set(matches.flatMap((m) => m.members))]))
      .for("key share");
    const alive = new Set(present.map((p) => p.id));
    const candidates = matches.filter((m) => m.members.every((id) => alive.has(id)));
    if (candidates.length === 0) {
      return;
    }
    const updated = await tx
      .update(match)
      .set({ nudgedAt: now })
      .where(
        inArray(
          match.id,
          candidates.map((m) => m.id),
        ),
      )
      .returning({ id: match.id });
    const still = new Set(updated.map((u) => u.id));
    const rows = candidates
      .filter((m) => still.has(m.id))
      .flatMap((m) =>
        m.members.map((userId) => ({ userId, type: "chat_nudge", payload: { matchId: m.id } })),
      );
    if (rows.length === 0) {
      return;
    }
    for (let start = 0; start < rows.length; start += 1000) {
      await tx.insert(notification).values(rows.slice(start, start + 1000));
    }
    await enqueue(
      tx,
      rows.map((row) => ({ userId: row.userId, event: { type: "notification.created" as const } })),
    );
  });
}
