import { decryptText, type KeyRing, keyRingFromEnv } from "@atomes/crypto";
import type { Database } from "@atomes/db";
import { lastMessagesOf } from "@atomes/db/repositories/messaging";

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

/**
 * An unreadable body (retired key, corrupted data) shows as empty instead of
 * breaking the whole conversation; only the error class is logged.
 */
export function decryptBody(body: Uint8Array | null, keyId: string | null): string {
  if (!body || !keyId) {
    return "";
  }
  try {
    return decryptText(messageKeyRing(), { keyId, data: body });
  } catch (error) {
    console.error(`[messaging] unreadable message body: ${error instanceof Error ? error.name : "unknown"}`);
    return "";
  }
}

const PREVIEW_LENGTH = 80;

export async function lastMessagePreviews(db: Database, matchIds: readonly string[]) {
  const rows = await lastMessagesOf(db, matchIds);
  const previews = new Map<string, { text: string; kind: string; at: Date; senderId: string | null }>();
  for (const [matchId, row] of rows) {
    const text = row.kind === "text" ? decryptBody(row.bodyEncrypted, row.keyId) : "";
    previews.set(matchId, {
      text: text.length > PREVIEW_LENGTH ? `${text.slice(0, PREVIEW_LENGTH - 1)}…` : text,
      kind: row.kind,
      at: row.createdAt,
      senderId: row.senderId,
    });
  }
  return previews;
}
