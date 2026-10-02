/**
 * App lock (SAF-13): a device setting, never sent to the server. Unlocking
 * asks for the device's biometrics through a passkey, or a PIN code whose
 * salted PBKDF2 hash stays in this browser.
 */

export type LockMethod = "passkey" | "pin";

export interface LockConfig {
  readonly version: 1;
  readonly method: LockMethod;
  /** Minutes in the background before the app locks again. */
  readonly timeoutMinutes: number;
  readonly pin?: { readonly salt: string; readonly hash: string };
  /** Passkey credential ids (base64url) usable to unlock. */
  readonly credentialIds?: readonly string[];
}

export interface LockSession {
  /** When the app was last unlocked or seen in the foreground, in this tab. */
  readonly activeAt: number;
}

export const LOCK_TIMEOUTS = [0, 1, 5, 15] as const;
/** "Immediately" still survives a reload or a quick glance away. */
export const LOCK_GRACE_MS = 10_000;
export const PIN_ATTEMPTS = 5;
const PBKDF2_ITERATIONS = 210_000;

export const lockKey = (userId: string) => `epilove:lock:${userId}`;
export const sessionKey = (userId: string) => `epilove:unlocked:${userId}`;

export function isPin(value: string): boolean {
  return /^\d{4,6}$/.test(value);
}

/**
 * Locked unless this tab was active recently enough. A new tab, or the
 * installed app coming back after the timeout, starts locked.
 */
export function shouldLock(config: LockConfig | null, session: LockSession | null, now: number): boolean {
  if (!config) return false;
  if (!session) return true;
  return now - session.activeAt > Math.max(config.timeoutMinutes * 60_000, LOCK_GRACE_MS);
}

export function parseConfig(raw: string | null): LockConfig | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<LockConfig>;
    if (value.version !== 1 || (value.method !== "pin" && value.method !== "passkey")) return null;
    if (!(LOCK_TIMEOUTS as readonly number[]).includes(value.timeoutMinutes ?? -1)) return null;
    if (value.method === "pin" && !(value.pin?.salt && value.pin.hash)) return null;
    return value as LockConfig;
  } catch {
    return null;
  }
}

function toBase64(bytes: ArrayBuffer | Uint8Array): string {
  return btoa(String.fromCharCode(...new Uint8Array(bytes)));
}

export async function hashPin(pin: string, salt: string): Promise<string> {
  const material = await crypto.subtle.importKey("raw", new TextEncoder().encode(pin), "PBKDF2", false, [
    "deriveBits",
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: new TextEncoder().encode(salt), iterations: PBKDF2_ITERATIONS },
    material,
    256,
  );
  return toBase64(bits);
}

export async function pinConfig(pin: string, timeoutMinutes: number): Promise<LockConfig> {
  const salt = toBase64(crypto.getRandomValues(new Uint8Array(16)));
  return { version: 1, method: "pin", timeoutMinutes, pin: { salt, hash: await hashPin(pin, salt) } };
}

export async function checkPin(config: LockConfig, pin: string): Promise<boolean> {
  if (!config.pin || !isPin(pin)) return false;
  const hash = await hashPin(pin, config.pin.salt);
  // Constant-time comparison is not needed for a local check, but costs nothing.
  let difference = hash.length ^ config.pin.hash.length;
  for (let index = 0; index < Math.min(hash.length, config.pin.hash.length); index += 1) {
    difference |= hash.charCodeAt(index) ^ config.pin.hash.charCodeAt(index);
  }
  return difference === 0;
}

/**
 * Hides the app before the first paint when it should be locked (runs
 * inline, before the content is parsed). Mirrors `shouldLock`.
 */
export function earlyLockScript(userId: string): string {
  const lock = JSON.stringify(lockKey(userId));
  const session = JSON.stringify(sessionKey(userId));
  return `(function(){try{var c=JSON.parse(localStorage.getItem(${lock})||"null");if(!c||c.version!==1)return;var s=JSON.parse(sessionStorage.getItem(${session})||"null");if(!s||Date.now()-s.activeAt>Math.max(c.timeoutMinutes*60000,${LOCK_GRACE_MS}))document.documentElement.setAttribute("data-locked","")}catch(e){}})();`;
}
