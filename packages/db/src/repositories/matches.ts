import { and, desc, eq, or, sql } from "drizzle-orm";
import type { Database } from "../client";
import { match, message, messageRead, notification, outbox } from "../schema";

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
    await tx.insert(outbox).values([
      { topic: "match.closed", payload: { userId: updated.userLow, matchId } },
      { topic: "match.closed", payload: { userId: updated.userHigh, matchId } },
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
