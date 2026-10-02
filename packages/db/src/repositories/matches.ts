import { and, desc, eq, inArray, or, sql } from "drizzle-orm";
import type { Database } from "../client";
import { match, message, messageRead, notification } from "../schema";
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
      unread: sql<number>`(
        select count(*)::int from ${message}
        where ${message.matchId} = ${match.id}
          and ${message.senderId} is distinct from ${userId}
          and ${message.deletedAt} is null
          and ${message.id} > coalesce(
            (select ${messageRead.lastReadMessageId} from ${messageRead}
             where ${messageRead.matchId} = ${match.id} and ${messageRead.userId} = ${userId}),
            '00000000-0000-0000-0000-000000000000'::uuid)
      )`,
    })
    .from(match)
    .where(and(eq(match.status, "active"), or(eq(match.userLow, userId), eq(match.userHigh, userId))))
    .orderBy(desc(sql`coalesce(${match.lastMessageAt}, ${match.createdAt})`));
  return rows.map((r) => ({
    id: r.id,
    otherId: r.userLow === userId ? r.userHigh : r.userLow,
    mode: r.mode,
    source: r.source,
    createdAt: r.createdAt,
    lastMessageAt: r.lastMessageAt,
    unread: r.unread,
  }));
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
    await tx
      .update(match)
      .set({ nudgedAt: now })
      .where(
        inArray(
          match.id,
          matches.map((m) => m.id),
        ),
      );
    const rows = matches.flatMap((m) =>
      m.members.map((userId) => ({ userId, type: "chat_nudge", payload: { matchId: m.id } })),
    );
    for (let start = 0; start < rows.length; start += 1000) {
      await tx.insert(notification).values(rows.slice(start, start + 1000));
    }
    await enqueue(
      tx,
      rows.map((row) => ({ userId: row.userId, event: { type: "notification.created" as const } })),
    );
  });
}
