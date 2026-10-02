import campusEn from "../messages/en/campus.json";
import commonEn from "../messages/en/common.json";
import homeEn from "../messages/en/home.json";
import questionnaireEn from "../messages/en/questionnaire.json";
import campusFr from "../messages/fr/campus.json";
import commonFr from "../messages/fr/common.json";
import homeFr from "../messages/fr/home.json";
import questionnaireFr from "../messages/fr/questionnaire.json";

export const LOCALES = ["fr", "en"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "fr";

/**
 * One namespace per feature, one JSON file per namespace and locale
 * (apps/web/messages/<locale>/<namespace>.json). Append-only: two imports and
 * one line per namespace, alphabetical (docs/sessions-paralleles.md).
 */
const namespaces = {
  campus: { fr: campusFr, en: campusEn },
  common: { fr: commonFr, en: commonEn },
  home: { fr: homeFr, en: homeEn },
  questionnaire: { fr: questionnaireFr, en: questionnaireEn },
} as const;

type Namespaces = typeof namespaces;
export type Messages = { [N in keyof Namespaces]: Namespaces[N]["fr"] };

export function messagesFor(locale: Locale): Messages {
  return Object.fromEntries(
    Object.entries(namespaces).map(([name, byLocale]) => [name, byLocale[locale]]),
  ) as Messages;
}
