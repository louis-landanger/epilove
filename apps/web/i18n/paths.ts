import { DEFAULT_LOCALE, LOCALES, type Locale, localizedPath } from "@atomes/core";
import type { Metadata, Route } from "next";

/** Public pages that exist in every language, under a prefix for English (`/en/legal/cgu`). */
export const LOCALIZED_PUBLIC_PATHS = ["/", "/legal"] as const;

export function isLocalizedPublicPath(pathname: string): boolean {
  return LOCALIZED_PUBLIC_PATHS.some(
    (path) => pathname === path || (path !== "/" && pathname.startsWith(`${path}/`)),
  );
}

/** Link to a public page in the current language. */
export function publicHref(locale: Locale, pathname: string): Route {
  return localizedPath(locale, pathname) as Route;
}

/** Canonical URL and `hreflang` alternates of a public page. */
export function publicAlternates(locale: Locale, pathname: string): Metadata["alternates"] {
  return {
    canonical: localizedPath(locale, pathname),
    languages: {
      ...Object.fromEntries(LOCALES.map((code) => [code, localizedPath(code, pathname)])),
      "x-default": localizedPath(DEFAULT_LOCALE, pathname),
    },
  };
}
