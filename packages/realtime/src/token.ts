import { createHmac } from "node:crypto";

/**
 * HS256 connection token for Centrifugo (`client.token.hmac_secret_key`).
 * Short-lived: the browser SDK asks for a new one before it expires.
 */
const base64url = (value: string | Buffer) => Buffer.from(value).toString("base64url");

export function connectionToken(
  secret: string,
  userId: string,
  options: { ttlSeconds?: number; now?: Date } = {},
) {
  if (secret.length < 16) {
    throw new Error("CENTRIFUGO_TOKEN_SECRET is too short.");
  }
  const iat = Math.floor((options.now ?? new Date()).getTime() / 1000);
  const exp = iat + (options.ttlSeconds ?? 600);
  const header = base64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = base64url(JSON.stringify({ sub: userId, iat, exp }));
  const signature = createHmac("sha256", secret).update(`${header}.${payload}`).digest("base64url");
  return { token: `${header}.${payload}.${signature}`, expiresAt: new Date(exp * 1000) };
}
