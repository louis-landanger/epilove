import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * AES-256-GCM encryption of sensitive text (message bodies, report details),
 * see docs/05-donnees.md section 5. Each value records the id of the key that
 * encrypted it, so keys can be rotated without re-encrypting everything at once.
 *
 * Stored layout: [12-byte IV][16-byte auth tag][ciphertext].
 */
export interface KeyRing {
  /** Key used for new values. */
  readonly currentKeyId: string;
  /** Every key still able to decrypt, 32 bytes each. */
  readonly keys: ReadonlyMap<string, Uint8Array>;
}

export interface EncryptedValue {
  readonly keyId: string;
  readonly data: Uint8Array;
}

const IV_LENGTH = 12;
const TAG_LENGTH = 16;
const KEY_LENGTH = 32;

function keyFor(ring: KeyRing, keyId: string): Uint8Array {
  const key = ring.keys.get(keyId);
  if (!key) {
    throw new Error(`Unknown encryption key id: ${keyId}`);
  }
  if (key.length !== KEY_LENGTH) {
    throw new Error(`Encryption key ${keyId} must be ${KEY_LENGTH} bytes.`);
  }
  return key;
}

export function encryptText(ring: KeyRing, plaintext: string): EncryptedValue {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv("aes-256-gcm", keyFor(ring, ring.currentKeyId), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const data = Buffer.concat([iv, cipher.getAuthTag(), ciphertext]);
  return { keyId: ring.currentKeyId, data: new Uint8Array(data) };
}

export function decryptText(ring: KeyRing, value: EncryptedValue): string {
  const data = Buffer.from(value.data);
  if (data.length < IV_LENGTH + TAG_LENGTH) {
    throw new Error("Encrypted value is truncated.");
  }
  const decipher = createDecipheriv("aes-256-gcm", keyFor(ring, value.keyId), data.subarray(0, IV_LENGTH));
  decipher.setAuthTag(data.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH));
  return Buffer.concat([decipher.update(data.subarray(IV_LENGTH + TAG_LENGTH)), decipher.final()]).toString(
    "utf8",
  );
}

/**
 * Reads a key ring from the environment:
 * `ENCRYPTION_KEYS="k2026a:<base64>,k2025b:<base64>"` and `ENCRYPTION_CURRENT_KEY_ID="k2026a"`.
 */
export function keyRingFromEnv(env: Record<string, string | undefined> = process.env): KeyRing {
  const raw = env.ENCRYPTION_KEYS;
  const currentKeyId = env.ENCRYPTION_CURRENT_KEY_ID;
  if (!raw || !currentKeyId) {
    throw new Error("ENCRYPTION_KEYS and ENCRYPTION_CURRENT_KEY_ID must be set.");
  }
  const keys = new Map<string, Uint8Array>();
  for (const entry of raw.split(",")) {
    const [keyId, base64] = entry.trim().split(":");
    if (!keyId || !base64) {
      throw new Error("ENCRYPTION_KEYS entries must look like id:base64.");
    }
    keys.set(keyId, new Uint8Array(Buffer.from(base64, "base64")));
  }
  const ring = { currentKeyId, keys };
  keyFor(ring, currentKeyId);
  return ring;
}
