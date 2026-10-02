import authEn from "../messages/en/auth.json";
import commonEn from "../messages/en/common.json";
import homeEn from "../messages/en/home.json";
import navEn from "../messages/en/nav.json";
import onboardingEn from "../messages/en/onboarding.json";
import authFr from "../messages/fr/auth.json";
import commonFr from "../messages/fr/common.json";
import homeFr from "../messages/fr/home.json";
import navFr from "../messages/fr/nav.json";
import onboardingFr from "../messages/fr/onboarding.json";

export const LOCALES = ["fr", "en"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "fr";

/**
 * One namespace per feature, one JSON file per namespace and locale
 * (apps/web/messages/<locale>/<namespace>.json). Append-only: two imports and
 * one line per namespace, alphabetical (docs/sessions-paralleles.md).
 */
const namespaces = {
  auth: { fr: authFr, en: authEn },
  common: { fr: commonFr, en: commonEn },
  home: { fr: homeFr, en: homeEn },
  nav: { fr: navFr, en: navEn },
  onboarding: { fr: onboardingFr, en: onboardingEn },
} as const;

type Namespaces = typeof namespaces;
export type Messages = { [N in keyof Namespaces]: Namespaces[N]["fr"] };

export function messagesFor(locale: Locale): Messages {
  return Object.fromEntries(
    Object.entries(namespaces).map(([name, byLocale]) => [name, byLocale[locale]]),
  ) as Messages;
}
