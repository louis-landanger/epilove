import authEn from "../messages/en/auth.json";
import campusEn from "../messages/en/campus.json";
import chatEn from "../messages/en/chat.json";
import commonEn from "../messages/en/common.json";
import discoveryEn from "../messages/en/discovery.json";
import eventsEn from "../messages/en/events.json";
import helpEn from "../messages/en/help.json";
import homeEn from "../messages/en/home.json";
import legalEn from "../messages/en/legal.json";
import likesEn from "../messages/en/likes.json";
import marketingEn from "../messages/en/marketing.json";
import matchesEn from "../messages/en/matches.json";
import navEn from "../messages/en/nav.json";
import notificationsEn from "../messages/en/notifications.json";
import onboardingEn from "../messages/en/onboarding.json";
import pactEn from "../messages/en/pact.json";
import profileEn from "../messages/en/profile.json";
import questionnaireEn from "../messages/en/questionnaire.json";
import safetyEn from "../messages/en/safety.json";
import settingsEn from "../messages/en/settings.json";
import spotsEn from "../messages/en/spots.json";
import waitlistEn from "../messages/en/waitlist.json";
import authFr from "../messages/fr/auth.json";
import campusFr from "../messages/fr/campus.json";
import chatFr from "../messages/fr/chat.json";
import commonFr from "../messages/fr/common.json";
import discoveryFr from "../messages/fr/discovery.json";
import eventsFr from "../messages/fr/events.json";
import helpFr from "../messages/fr/help.json";
import homeFr from "../messages/fr/home.json";
import legalFr from "../messages/fr/legal.json";
import likesFr from "../messages/fr/likes.json";
import marketingFr from "../messages/fr/marketing.json";
import matchesFr from "../messages/fr/matches.json";
import navFr from "../messages/fr/nav.json";
import notificationsFr from "../messages/fr/notifications.json";
import onboardingFr from "../messages/fr/onboarding.json";
import pactFr from "../messages/fr/pact.json";
import profileFr from "../messages/fr/profile.json";
import questionnaireFr from "../messages/fr/questionnaire.json";
import safetyFr from "../messages/fr/safety.json";
import settingsFr from "../messages/fr/settings.json";
import spotsFr from "../messages/fr/spots.json";
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
  auth: { fr: authFr, en: authEn },
  campus: { fr: campusFr, en: campusEn },
  chat: { fr: chatFr, en: chatEn },
  common: { fr: commonFr, en: commonEn },
  discovery: { fr: discoveryFr, en: discoveryEn },
  events: { fr: eventsFr, en: eventsEn },
  help: { fr: helpFr, en: helpEn },
  home: { fr: homeFr, en: homeEn },
  legal: { fr: legalFr, en: legalEn },
  likes: { fr: likesFr, en: likesEn },
  marketing: { fr: marketingFr, en: marketingEn },
  matches: { fr: matchesFr, en: matchesEn },
  nav: { fr: navFr, en: navEn },
  notifications: { fr: notificationsFr, en: notificationsEn },
  onboarding: { fr: onboardingFr, en: onboardingEn },
  pact: { fr: pactFr, en: pactEn },
  profile: { fr: profileFr, en: profileEn },
  questionnaire: { fr: questionnaireFr, en: questionnaireEn },
  safety: { fr: safetyFr, en: safetyEn },
  settings: { fr: settingsFr, en: settingsEn },
  spots: { fr: spotsFr, en: spotsEn },
  waitlist: { fr: waitlistFr, en: waitlistEn },
} as const;

type Namespaces = typeof namespaces;
export type Messages = { [N in keyof Namespaces]: Namespaces[N]["fr"] };

export function messagesFor(locale: Locale): Messages {
  return Object.fromEntries(
    Object.entries(namespaces).map(([name, byLocale]) => [name, byLocale[locale]]),
  ) as Messages;
}
