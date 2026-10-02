import campusEn from "../messages/en/campus.json";
import chatEn from "../messages/en/chat.json";
import commonEn from "../messages/en/common.json";
import discoveryEn from "../messages/en/discovery.json";
import homeEn from "../messages/en/home.json";
import likesEn from "../messages/en/likes.json";
import matchesEn from "../messages/en/matches.json";
import notificationsEn from "../messages/en/notifications.json";
import pactEn from "../messages/en/pact.json";
import questionnaireEn from "../messages/en/questionnaire.json";
import campusFr from "../messages/fr/campus.json";
import chatFr from "../messages/fr/chat.json";
import commonFr from "../messages/fr/common.json";
import discoveryFr from "../messages/fr/discovery.json";
import homeFr from "../messages/fr/home.json";
import likesFr from "../messages/fr/likes.json";
import matchesFr from "../messages/fr/matches.json";
import notificationsFr from "../messages/fr/notifications.json";
import pactFr from "../messages/fr/pact.json";
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
  chat: { fr: chatFr, en: chatEn },
  common: { fr: commonFr, en: commonEn },
  discovery: { fr: discoveryFr, en: discoveryEn },
  home: { fr: homeFr, en: homeEn },
  likes: { fr: likesFr, en: likesEn },
  matches: { fr: matchesFr, en: matchesEn },
  notifications: { fr: notificationsFr, en: notificationsEn },
  pact: { fr: pactFr, en: pactEn },
  questionnaire: { fr: questionnaireFr, en: questionnaireEn },
} as const;

type Namespaces = typeof namespaces;
export type Messages = { [N in keyof Namespaces]: Namespaces[N]["fr"] };

export function messagesFor(locale: Locale): Messages {
  return Object.fromEntries(
    Object.entries(namespaces).map(([name, byLocale]) => [name, byLocale[locale]]),
  ) as Messages;
}
