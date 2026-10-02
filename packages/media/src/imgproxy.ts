import { createHmac } from "node:crypto";

/**
 * Signed imgproxy URLs (docs/07-confiance-securite.md): media are never
 * served from a permanent public URL. Each URL is signed and expires.
 */
export interface ImgproxyConfig {
  readonly baseUrl: string;
  /** Hex-encoded key and salt (IMGPROXY_KEY / IMGPROXY_SALT). */
  readonly keyHex: string;
  readonly saltHex: string;
  /** S3 bucket holding the originals. */
  readonly bucket: string;
}

export interface PhotoUrlOptions {
  readonly width: number;
  readonly height?: number;
  /** Seconds before the URL stops working. */
  readonly ttlSeconds?: number;
  readonly format?: "avif" | "webp" | "jpg";
  readonly now?: Date;
}

const DEFAULT_TTL_SECONDS = 3600;

function sign(config: ImgproxyConfig, path: string): string {
  return createHmac("sha256", Buffer.from(config.keyHex, "hex"))
    .update(Buffer.from(config.saltHex, "hex"))
    .update(path)
    .digest("base64url");
}

/** URL of a resized photo, valid for `ttlSeconds` (one hour by default). */
export function photoUrl(config: ImgproxyConfig, storageKey: string, options: PhotoUrlOptions): string {
  if (storageKey.includes("..") || storageKey.startsWith("/")) {
    throw new Error("Invalid storage key.");
  }
  const now = options.now ?? new Date();
  const expires = Math.floor(now.getTime() / 1000) + (options.ttlSeconds ?? DEFAULT_TTL_SECONDS);
  const source = Buffer.from(`s3://${config.bucket}/${storageKey}`).toString("base64url");
  const processing = [`rs:fill:${options.width}:${options.height ?? 0}`, `exp:${expires}`, "sm:1"].join("/");
  const path = `/${processing}/${source}.${options.format ?? "webp"}`;
  return `${config.baseUrl.replace(/\/$/, "")}/${sign(config, path)}${path}`;
}

export function imgproxyConfigFromEnv(env: Record<string, string | undefined> = process.env): ImgproxyConfig {
  const { IMGPROXY_URL, IMGPROXY_KEY, IMGPROXY_SALT, S3_BUCKET } = env;
  if (!IMGPROXY_URL || !IMGPROXY_KEY || !IMGPROXY_SALT || !S3_BUCKET) {
    throw new Error("IMGPROXY_URL, IMGPROXY_KEY, IMGPROXY_SALT and S3_BUCKET must be set.");
  }
  return { baseUrl: IMGPROXY_URL, keyHex: IMGPROXY_KEY, saltHex: IMGPROXY_SALT, bucket: S3_BUCKET };
}
