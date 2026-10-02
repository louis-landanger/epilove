import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { decryptText, encryptText, type KeyRing, keyRingFromEnv } from "./envelope";
import { emailHmac } from "./hmac";

const key = () => new Uint8Array(randomBytes(32));

describe("envelope encryption", () => {
  const ring: KeyRing = { currentKeyId: "k1", keys: new Map([["k1", key()]]) };

  it("round-trips unicode text", () => {
    const text = "Salut 👋 on se voit au campus de Vaise ?";
    const encrypted = encryptText(ring, text);
    expect(encrypted.keyId).toBe("k1");
    expect(Buffer.from(encrypted.data).toString("utf8")).not.toContain("campus");
    expect(decryptText(ring, encrypted)).toBe(text);
  });

  it("uses a fresh IV for every value", () => {
    const a = encryptText(ring, "same");
    const b = encryptText(ring, "same");
    expect(Buffer.from(a.data).equals(Buffer.from(b.data))).toBe(false);
  });

  it("detects tampering", () => {
    const encrypted = encryptText(ring, "message");
    const tampered = new Uint8Array(encrypted.data);
    tampered[tampered.length - 1] = (tampered[tampered.length - 1] ?? 0) ^ 1;
    expect(() => decryptText(ring, { ...encrypted, data: tampered })).toThrow();
  });

  it("decrypts values written with an older key after rotation", () => {
    const oldKey = key();
    const before: KeyRing = { currentKeyId: "old", keys: new Map([["old", oldKey]]) };
    const encrypted = encryptText(before, "avant rotation");
    const after: KeyRing = {
      currentKeyId: "new",
      keys: new Map([
        ["new", key()],
        ["old", oldKey],
      ]),
    };
    expect(decryptText(after, encrypted)).toBe("avant rotation");
    expect(encryptText(after, "x").keyId).toBe("new");
  });

  it("reads the key ring from the environment", () => {
    const ring2 = keyRingFromEnv({
      ENCRYPTION_KEYS: `a:${Buffer.from(key()).toString("base64")}, b:${Buffer.from(key()).toString("base64")}`,
      ENCRYPTION_CURRENT_KEY_ID: "b",
    });
    expect([...ring2.keys.keys()]).toEqual(["a", "b"]);
    expect(() => keyRingFromEnv({ ENCRYPTION_KEYS: "a:AAAA", ENCRYPTION_CURRENT_KEY_ID: "a" })).toThrow();
    expect(() => keyRingFromEnv({})).toThrow();
  });
});

describe("emailHmac", () => {
  const secret = "x".repeat(32);

  it("is deterministic and does not reveal the address", () => {
    const hmac = emailHmac(secret, "prenom.nom@epita.fr");
    expect(hmac).toBe(emailHmac(secret, "prenom.nom@epita.fr"));
    expect(hmac).toMatch(/^[0-9a-f]{64}$/);
    expect(hmac).not.toBe(emailHmac(secret, "prenom.nom@esme.fr"));
  });

  it("refuses short secrets", () => {
    expect(() => emailHmac("short", "a@epita.fr")).toThrow();
  });
});
