import { and, desc, inArray, isNull } from "drizzle-orm";
import type { Database } from "../client";
import { message } from "../schema";

/** Message storage (CHAT-02). Bodies stay encrypted here; decryption happens in the API layer. */

export interface StoredMessage {
  readonly id: string;
  readonly matchId: string;
  readonly senderId: string | null;
  readonly kind: string;
  readonly bodyEncrypted: Uint8Array | null;
  readonly keyId: string | null;
  readonly replyTo: string | null;
  readonly createdAt: Date;
  readonly editedAt: Date | null;
  readonly deletedAt: Date | null;
}

/** The latest message of each match. */
export async function lastMessagesOf(
  db: Database,
  matchIds: readonly string[],
): Promise<Map<string, StoredMessage>> {
  if (matchIds.length === 0) {
    return new Map();
  }
  const rows = await db
    .selectDistinctOn([message.matchId], {
      id: message.id,
      matchId: message.matchId,
      senderId: message.senderId,
      kind: message.kind,
      bodyEncrypted: message.bodyEncrypted,
      keyId: message.keyId,
      replyTo: message.replyTo,
      createdAt: message.createdAt,
      editedAt: message.editedAt,
      deletedAt: message.deletedAt,
    })
    .from(message)
    .where(and(inArray(message.matchId, [...matchIds]), isNull(message.deletedAt)))
    .orderBy(message.matchId, desc(message.id));
  return new Map(rows.map((r) => [r.matchId, r]));
}
