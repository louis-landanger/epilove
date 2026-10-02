import { z } from "zod";

/**
 * Realtime events, defined once and shared by the publisher (worker, API) and
 * the clients (docs/04-architecture.md, section 5).
 *
 * Privacy rule (ADR 0020): events carry identifiers only, never a message
 * body, a first name or a preference. Clients fetch the content through the
 * API, where access policies apply. Centrifugo therefore never holds
 * personal data, not even in its short recovery history.
 */
const uuid = z.string().uuid();

export const realtimeEvent = z.discriminatedUnion("type", [
  z.object({ type: z.literal("match.created"), matchId: uuid }),
  z.object({ type: z.literal("match.closed"), matchId: uuid }),
  z.object({ type: z.literal("like.received"), superlike: z.boolean() }),
  z.object({ type: z.literal("message.created"), matchId: uuid, messageId: uuid }),
  z.object({ type: z.literal("message.updated"), matchId: uuid, messageId: uuid }),
  z.object({ type: z.literal("message.read"), matchId: uuid, lastReadMessageId: uuid }),
  z.object({ type: z.literal("typing"), matchId: uuid }),
  z.object({ type: z.literal("notification.created") }),
  z.object({ type: z.literal("pact.reveal"), seasonId: uuid }),
]);

export type RealtimeEvent = z.infer<typeof realtimeEvent>;
export type RealtimeEventType = RealtimeEvent["type"];

/** Parses an incoming publication; unknown or malformed events are ignored by clients. */
export function parseRealtimeEvent(data: unknown): RealtimeEvent | null {
  const result = realtimeEvent.safeParse(data);
  return result.success ? result.data : null;
}

/** Personal channel of a member: user-limited (`#`), only that member can subscribe. */
export const personalChannel = (userId: string) => `personal:#${userId}`;

/** Campus-wide broadcast channel of the Pact reveal (PAC-03). */
export const PACT_CHANNEL = "broadcast:pact";

/** Channels any signed-in member can subscribe to. Never anything personal on them. */
export const BROADCAST_CHANNELS = [PACT_CHANNEL] as const;
export type BroadcastChannel = (typeof BROADCAST_CHANNELS)[number];
