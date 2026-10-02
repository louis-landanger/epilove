import { type ImgproxyConfig, imgproxyConfigFromEnv, photoUrl } from "@epilove/media";

/**
 * Signed, expiring photo URLs. When imgproxy is not configured (unit tests
 * without the local services), a neutral placeholder is returned instead.
 */
export const PHOTO_PLACEHOLDER = "/rencontre/photo-placeholder.svg";

let config: ImgproxyConfig | null | undefined;

function imgproxy(): ImgproxyConfig | null {
  if (config === undefined) {
    try {
      config = imgproxyConfigFromEnv();
    } catch {
      config = null;
    }
  }
  return config;
}

export type PhotoSize = "card" | "full" | "thumb";
const SIZES: Record<PhotoSize, { width: number; height: number }> = {
  thumb: { width: 160, height: 200 },
  card: { width: 640, height: 800 },
  full: { width: 1080, height: 1350 },
};

export function signedPhotoUrl(storageKey: string, size: PhotoSize = "card"): string {
  const settings = imgproxy();
  if (!settings) {
    return PHOTO_PLACEHOLDER;
  }
  // Rounded expiry so that the same photo keeps the same URL for a while (CDN and browser caches).
  const now = new Date(Math.floor(Date.now() / 900_000) * 900_000);
  return photoUrl(settings, storageKey, { ...SIZES[size], ttlSeconds: 3600 + 900, now });
}
