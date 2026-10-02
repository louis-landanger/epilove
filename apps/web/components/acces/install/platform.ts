export const INSTALL_PLATFORMS = ["ios", "android", "desktop"] as const;
export type InstallPlatform = (typeof INSTALL_PLATFORMS)[number];

/**
 * The install steps differ by system, not by browser: since iOS 16.4 every
 * iOS browser offers "Add to Home Screen" from its share sheet. iPadOS
 * presents itself as a Mac, but with a touch screen.
 */
export function detectPlatform(userAgent: string, maxTouchPoints = 0): InstallPlatform {
  if (/iPhone|iPad|iPod/i.test(userAgent) || (/Macintosh/i.test(userAgent) && maxTouchPoints > 1)) {
    return "ios";
  }
  if (/Android/i.test(userAgent)) {
    return "android";
  }
  return "desktop";
}
