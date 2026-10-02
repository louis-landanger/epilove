import commonEn from "../messages/en/common.json";
import homeEn from "../messages/en/home.json";
import legalEn from "../messages/en/legal.json";
import marketingEn from "../messages/en/marketing.json";
import waitlistEn from "../messages/en/waitlist.json";
import commonFr from "../messages/fr/common.json";
import homeFr from "../messages/fr/home.json";
import legalFr from "../messages/fr/legal.json";
import marketingFr from "../messages/fr/marketing.json";
import waitlistFr from "../messages/fr/waitlist.json";

export const LOCALES = ["fr", "en"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "fr";

/**
 * One namespace per feature, one JSON file per namespace and locale
 * (apps/web/messages/<locale>/<namespace>.json). Append-only: two imports and
 * one line per namespace, alphabetical (docs/sessions-paralleles.md).
 */
const namespaces = {
  common: { fr: commonFr, en: commonEn },
  home: { fr: homeFr, en: homeEn },
  legal: { fr: legalFr, en: legalEn },
  marketing: { fr: marketingFr, en: marketingEn },
  waitlist: { fr: waitlistFr, en: waitlistEn },
} as const;

type Namespaces = typeof namespaces;
export type Messages = { [N in keyof Namespaces]: Namespaces[N]["fr"] };

export function messagesFor(locale: Locale): Messages {
  return Object.fromEntries(
    Object.entries(namespaces).map(([name, byLocale]) => [name, byLocale[locale]]),
  ) as Messages;
}
