import type { Database } from "@epilove/db";
import { listenForOutbox, type PendingEvent, relayPending } from "@epilove/db/repositories/outbox";
import { type Publisher, personalChannel } from "@epilove/realtime";

export interface OutboxRelayOptions {
  readonly db: Database;
  readonly databaseUrl: string;
  readonly publisher: Publisher;
  /** Safety net when a notification is missed (connection loss, restart). */
  readonly pollIntervalMs?: number;
  readonly log?: (line: string) => void;
  /** Runs after each drain (push notifications of the events just committed). */
  readonly afterDrain?: () => Promise<unknown>;
}

/** Publishes a batch: one personal-channel event each, deduplicated by Centrifugo on retries. */
export function publishBatch(publisher: Publisher) {
  return async (events: readonly PendingEvent[]) => {
    for (const event of events) {
      await publisher.publish(personalChannel(event.userId), event.event, { idempotencyKey: event.id });
    }
  };
}

/**
 * Outbox relay (docs/04-architecture.md): wakes up on `pg_notify` at commit,
 * drains pending events to Centrifugo, and polls every few seconds in case a
 * notification was lost. One drain at a time per process; several processes
 * can run side by side (SKIP LOCKED).
 */
export async function startOutboxRelay(options: OutboxRelayOptions) {
  const log = options.log ?? (() => {});
  let running = false;
  let again = false;
  let stopped = false;

  const drain = async () => {
    if (running) {
      again = true;
      return;
    }
    running = true;
    try {
      do {
        again = false;
        while (!stopped && (await relayPending(options.db, publishBatch(options.publisher))) > 0) {
          // Keep going until the outbox is empty.
        }
      } while (again && !stopped);
      await options.afterDrain?.();
    } catch (error) {
      // Events stay pending and are retried on the next notification or poll.
      log(`outbox relay failed: ${error instanceof Error ? error.name : "unknown"}`);
    } finally {
      running = false;
    }
  };

  const unlisten = await listenForOutbox(options.databaseUrl, () => void drain());
  const interval = setInterval(() => void drain(), options.pollIntervalMs ?? 5000);
  await drain();

  return {
    drain,
    async stop() {
      stopped = true;
      clearInterval(interval);
      await unlisten();
    },
  };
}
