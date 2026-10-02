import {
  centrifugoConfigFromEnv,
  createMemoryPublisher,
  createPublisher,
  type Publisher,
} from "@epilove/realtime";

/**
 * Centrifugo publisher used by the API for ephemeral events (typing) and
 * presence checks. Durable events go through the outbox and the worker.
 * Without configuration (unit tests), events are kept in memory.
 */
let publisher: Publisher | undefined;

export function realtimePublisher(): Publisher {
  if (!publisher) {
    const config = centrifugoConfigFromEnv();
    publisher = config ? createPublisher(config) : createMemoryPublisher().publisher;
  }
  return publisher;
}

export function setRealtimePublisher(next: Publisher | undefined) {
  publisher = next;
}
