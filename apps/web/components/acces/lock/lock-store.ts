"use client";

import { type LockConfig, type LockSession, lockKey, parseConfig, sessionKey } from "./lock-config";

/** Browser storage access for the app lock; every call tolerates blocked storage. */

export const LOCK_CHANGED = "atomes:lock-changed";
const attemptsKey = (userId: string) => `atomes:lock-attempts:${userId}`;

export function readConfig(userId: string): LockConfig | null {
  try {
    return parseConfig(window.localStorage.getItem(lockKey(userId)));
  } catch {
    return null;
  }
}

export function writeConfig(userId: string, config: LockConfig | null) {
  try {
    if (config) {
      window.localStorage.setItem(lockKey(userId), JSON.stringify(config));
    } else {
      window.localStorage.removeItem(lockKey(userId));
      window.localStorage.removeItem(attemptsKey(userId));
    }
  } catch {
    // Storage blocked: the lock simply stays off.
  }
  window.dispatchEvent(new Event(LOCK_CHANGED));
}

export function readSession(userId: string): LockSession | null {
  try {
    const value = JSON.parse(
      window.sessionStorage.getItem(sessionKey(userId)) ?? "null",
    ) as LockSession | null;
    return typeof value?.activeAt === "number" ? value : null;
  } catch {
    return null;
  }
}

export function markActive(userId: string, at = Date.now()) {
  try {
    window.sessionStorage.setItem(sessionKey(userId), JSON.stringify({ activeAt: at }));
  } catch {
    // Without session storage, every load starts locked: safe by default.
  }
}

export function clearSession(userId: string) {
  try {
    window.sessionStorage.removeItem(sessionKey(userId));
  } catch {}
}

export function readAttempts(userId: string): number {
  try {
    return Number(window.localStorage.getItem(attemptsKey(userId)) ?? 0) || 0;
  } catch {
    return 0;
  }
}

export function writeAttempts(userId: string, attempts: number) {
  try {
    window.localStorage.setItem(attemptsKey(userId), String(attempts));
  } catch {}
}

function fromBase64Url(value: string): Uint8Array<ArrayBuffer> {
  const base64 = value
    .replaceAll("-", "+")
    .replaceAll("_", "/")
    .padEnd(Math.ceil(value.length / 4) * 4, "=");
  return Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
}

/**
 * Asks the device to verify its owner (biometrics or device code) with one
 * of the member's passkeys. Local check: no new session is created.
 */
export async function verifyWithPasskey(credentialIds: readonly string[]): Promise<boolean> {
  if (credentialIds.length === 0 || !window.PublicKeyCredential) {
    return false;
  }
  const credential = (await navigator.credentials.get({
    publicKey: {
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      allowCredentials: credentialIds.map((id) => ({ type: "public-key", id: fromBase64Url(id) })),
      userVerification: "required",
      timeout: 60_000,
    },
  })) as PublicKeyCredential | null;
  const response = credential?.response as AuthenticatorAssertionResponse | undefined;
  if (!response) {
    return false;
  }
  // Flags byte of the authenticator data: bit 2 (UV) says the owner was verified.
  const flags = new Uint8Array(response.authenticatorData)[32] ?? 0;
  return (flags & 0x04) !== 0;
}
