/** Interface languages (PLT-04): French first, English for international students. */
export const LOCALES = ["fr", "en"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "fr";

/** Explicit language choice (switcher, or the account's language at sign-in). */
export const LOCALE_COOKIE = "NEXT_LOCALE";
/** Request header carrying the resolved language: set by the web proxy and the auth client. */
export const LOCALE_HEADER = "x-atomes-locale";

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

/**
 * Picks the best supported language from an `Accept-Language` header
 * (RFC 9110, section 12.5.4): highest weight first, then header order;
 * `q=0` excludes a language. Falls back to French.
 */
export function negotiateLocale(acceptLanguage: string | null | undefined): Locale {
  if (!acceptLanguage) {
    return DEFAULT_LOCALE;
  }
  const ranges = acceptLanguage
    .split(",")
    .slice(0, 32)
    .map((part, index) => {
      const [tag = "", ...parameters] = part.trim().split(";");
      const q = parameters
        .map((parameter) => parameter.trim())
        .find((parameter) => parameter.startsWith("q="));
      const weight = q ? Number(q.slice(2)) : 1;
      return {
        language: tag.trim().toLowerCase().split("-")[0] ?? "",
        weight: Number.isFinite(weight) ? Math.min(Math.max(weight, 0), 1) : 0,
        index,
      };
    })
    .filter((range) => range.weight > 0 && range.language !== "")
    .sort((a, b) => b.weight - a.weight || a.index - b.index);
  for (const range of ranges) {
    if (range.language === "*") {
      return DEFAULT_LOCALE;
    }
    if (isLocale(range.language)) {
      return range.language;
    }
  }
  return DEFAULT_LOCALE;
}

/** Locale prefix of public URLs: French has none (`/`), English lives under `/en`. */
export function splitLocalePrefix(pathname: string): { locale: Locale | null; pathname: string } {
  for (const locale of LOCALES) {
    if (locale === DEFAULT_LOCALE) {
      continue;
    }
    if (pathname === `/${locale}`) {
      return { locale, pathname: "/" };
    }
    if (pathname.startsWith(`/${locale}/`)) {
      return { locale, pathname: pathname.slice(locale.length + 1) };
    }
  }
  return { locale: null, pathname };
}

/** Public URL of a page in a given language (`/legal/cgu` → `/en/legal/cgu`). */
export function localizedPath(locale: Locale, pathname: string): string {
  const path = pathname.startsWith("/") ? pathname : `/${pathname}`;
  if (locale === DEFAULT_LOCALE) {
    return path;
  }
  return path === "/" ? `/${locale}` : `/${locale}${path}`;
}

/** Language of a request: explicit header, then the choice cookie, then `Accept-Language`. */
export function requestLocale(headers: Headers): Locale {
  const explicit = headers.get(LOCALE_HEADER);
  if (isLocale(explicit)) {
    return explicit;
  }
  const cookie = headers
    .get("cookie")
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${LOCALE_COOKIE}=`))
    ?.slice(LOCALE_COOKIE.length + 1);
  if (isLocale(cookie)) {
    return cookie;
  }
  return negotiateLocale(headers.get("accept-language"));
}
