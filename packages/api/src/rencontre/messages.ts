import { decryptText, type KeyRing, keyRingFromEnv } from "@epilove/crypto";
import type { Database } from "@epilove/db";
import { lastMessagesOf } from "@epilove/db/repositories/messaging";

/**
 * Message bodies are encrypted at rest (docs/05-donnees.md, section 5) and
 * decrypted here, only for the two members of the match.
 */
let ring: KeyRing | undefined;

export function messageKeyRing(): KeyRing {
  ring ??= keyRingFromEnv();
  return ring;
}

/** For tests: use another key ring. */
export function setMessageKeyRing(next: KeyRing | undefined) {
  ring = next;
}

export function decryptBody(body: Uint8Array | null, keyId: string | null): string {
  if (!body || !keyId) {
    return "";
  }
  return decryptText(messageKeyRing(), { keyId, data: body });
}

const PREVIEW_LENGTH = 80;

export async function lastMessagePreviews(db: Database, matchIds: readonly string[]) {
  const rows = await lastMessagesOf(db, matchIds);
  const previews = new Map<string, { text: string; at: Date; senderId: string | null }>();
  for (const [matchId, row] of rows) {
    const text = row.kind === "text" ? decryptBody(row.bodyEncrypted, row.keyId) : "";
    previews.set(matchId, {
      text: text.length > PREVIEW_LENGTH ? `${text.slice(0, PREVIEW_LENGTH - 1)}…` : text,
      at: row.createdAt,
      senderId: row.senderId,
    });
  }
  return previews;
}
