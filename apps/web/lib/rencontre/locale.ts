import { DEFAULT_LOCALE, isLocale, type Locale } from "@epilove/core";

/**
 * The language of the content the API writes (prompt questions, interests,
 * questionnaire, Spots…): the interface language (PLT-04), from `getLocale()`
 * on the server or `useLocale()` in the browser.
 */
export function contentLocale(locale: string): Locale {
  return isLocale(locale) ? locale : DEFAULT_LOCALE;
}
