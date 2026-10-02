import type { RealtimeEvent } from "@epilove/realtime/events";
import { asc, inArray, isNull, sql } from "drizzle-orm";
import type { Database } from "../client";
import { outbox } from "../schema";

/**
 * Transactional outbox (docs/04-architecture.md): events are written in the
 * same transaction as the business change, then published to Centrifugo by
 * the worker relay. `pg_notify` is delivered at commit only, so the relay
 * wakes up exactly when the events become visible.
 */
export const OUTBOX_CHANNEL = "epilove_outbox";

export interface OutboxEntry {
  /** Recipient: the event goes to their personal channel. */
  readonly userId: string;
  readonly event: RealtimeEvent;
}

type Executor = Pick<Database, "insert" | "execute">;

export async function enqueue(tx: Executor, entries: readonly OutboxEntry[]) {
  if (entries.length === 0) {
    return;
  }
  await tx.insert(outbox).values(
    entries.map((entry) => ({
      topic: entry.event.type,
      payload: { userId: entry.userId, event: entry.event },
    })),
  );
  await tx.execute(sql`select pg_notify(${OUTBOX_CHANNEL}, '')`);
}

export interface PendingEvent extends OutboxEntry {
  readonly id: string;
}

/**
 * Claims up to `limit` unpublished events, publishes them through `publish`
 * and marks them as published, all in one transaction. Concurrent relays skip
 * each other's rows (SKIP LOCKED). If publishing fails, nothing is marked and
 * the events are retried on the next run.
 */
export async function relayPending(
  db: Database,
  publish: (events: readonly PendingEvent[]) => Promise<void>,
  limit = 200,
): Promise<number> {
  return db.transaction(async (tx) => {
    const rows = await tx
      .select({ id: outbox.id, payload: outbox.payload })
      .from(outbox)
      .where(isNull(outbox.publishedAt))
      .orderBy(asc(outbox.createdAt))
      .limit(limit)
      .for("update", { skipLocked: true });
    if (rows.length === 0) {
      return 0;
    }
    const events = rows.flatMap((row) => {
      const payload = row.payload as Partial<OutboxEntry> | null;
      return payload?.userId && payload.event
        ? [{ id: row.id, userId: payload.userId, event: payload.event }]
        : [];
    });
    await publish(events);
    await tx
      .update(outbox)
      .set({ publishedAt: new Date() })
      .where(
        inArray(
          outbox.id,
          rows.map((row) => row.id),
        ),
      );
    return rows.length;
  });
}

/** Retention: published events are only useful for a short while. */
export async function purgePublished(db: Database, olderThan: Date) {
  await db
    .delete(outbox)
    .where(sql`${outbox.publishedAt} is not null and ${outbox.publishedAt} < ${olderThan.toISOString()}`);
}

/**
 * Calls `onNotify` whenever a transaction that wrote outbox events commits.
 * Uses its own connection (LISTEN keeps it busy). Returns a function that stops listening.
 */
export async function listenForOutbox(url: string, onNotify: () => void): Promise<() => Promise<void>> {
  const { default: postgres } = await import("postgres");
  const client = postgres(url, { max: 1 });
  await client.listen(OUTBOX_CHANNEL, onNotify);
  return () => client.end();
}
