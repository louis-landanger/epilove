import authEn from "../messages/en/auth.json";
import commonEn from "../messages/en/common.json";
import helpEn from "../messages/en/help.json";
import homeEn from "../messages/en/home.json";
import navEn from "../messages/en/nav.json";
import onboardingEn from "../messages/en/onboarding.json";
import profileEn from "../messages/en/profile.json";
import safetyEn from "../messages/en/safety.json";
import settingsEn from "../messages/en/settings.json";
import authFr from "../messages/fr/auth.json";
import commonFr from "../messages/fr/common.json";
import helpFr from "../messages/fr/help.json";
import homeFr from "../messages/fr/home.json";
import navFr from "../messages/fr/nav.json";
import onboardingFr from "../messages/fr/onboarding.json";
import profileFr from "../messages/fr/profile.json";
import safetyFr from "../messages/fr/safety.json";
import settingsFr from "../messages/fr/settings.json";

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
  help: { fr: helpFr, en: helpEn },
  home: { fr: homeFr, en: homeEn },
  nav: { fr: navFr, en: navEn },
  onboarding: { fr: onboardingFr, en: onboardingEn },
  profile: { fr: profileFr, en: profileEn },
  safety: { fr: safetyFr, en: safetyEn },
  settings: { fr: settingsFr, en: settingsEn },
} as const;

type Namespaces = typeof namespaces;
export type Messages = { [N in keyof Namespaces]: Namespaces[N]["fr"] };

export function messagesFor(locale: Locale): Messages {
  return Object.fromEntries(
    Object.entries(namespaces).map(([name, byLocale]) => [name, byLocale[locale]]),
  ) as Messages;
}
