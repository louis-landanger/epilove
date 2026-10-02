import { type NotificationType, notificationUrl } from "./types";

/**
 * Content of a push notification. Discreet by default (SAF-06): neither a
 * first name nor any content, because lock screens are seen by others. Even
 * when discretion is off, a message's text is never shown, only who wrote.
 */
export interface PushContent {
  readonly title: string;
  readonly body: string;
  /** Same tag = replaces the previous notification on the device (grouping, NOT-06). */
  readonly tag: string;
  readonly url: string;
}

type Locale = "fr" | "en";

const TEXTS = {
  fr: {
    title: "Epilove",
    like_received: "Quelqu'un t'a liké.",
    superlike_received: "Tu as reçu un coup de cœur.",
    match_created: "Nouvelle liaison !",
    match_created_named: "Liaison établie avec {name} !",
    message_received: "Nouveau message",
    message_received_named: "Nouveau message de {name}",
    chat_nudge: "Une conversation attend une relance.",
    chat_nudge_named: "Ça fait quelques jours avec {name}. Une idée pour relancer ?",
    drop_ready: "Ton Drop est arrivé.",
    pact_reveal: "C'est l'heure : les résultats du Pacte sont là.",
    event_cancelled: "Un événement auquel tu as répondu est annulé.",
  },
  en: {
    title: "Epilove",
    like_received: "Someone liked you.",
    superlike_received: "You got a crush.",
    match_created: "New bond!",
    match_created_named: "Bond formed with {name}!",
    message_received: "New message",
    message_received_named: "New message from {name}",
    chat_nudge: "A conversation is waiting for a nudge.",
    chat_nudge_named: "It's been a few days with {name}. An idea to restart?",
    drop_ready: "Your Drop is here.",
    pact_reveal: "It's time: the Pact results are in.",
    event_cancelled: "An event you answered has been cancelled.",
  },
} as const;

export interface RenderOptions {
  readonly discreet: boolean;
  /** First name of the other member, only used when discretion is off. */
  readonly otherFirstName?: string | null;
  readonly locale?: Locale;
  readonly payload?: { matchId?: string; eventId?: string } | null;
}

export function renderPush(type: NotificationType, options: RenderOptions): PushContent {
  const texts = TEXTS[options.locale ?? "fr"];
  const name = options.discreet ? null : (options.otherFirstName ?? null);
  const body =
    type === "match_created" && name
      ? texts.match_created_named.replace("{name}", name)
      : type === "message_received" && name
        ? texts.message_received_named.replace("{name}", name)
        : type === "chat_nudge" && name
          ? texts.chat_nudge_named.replace("{name}", name)
          : texts[type];
  return {
    title: texts.title,
    body,
    tag: options.payload?.matchId ? `${type}:${options.payload.matchId}` : type,
    url: notificationUrl(type, options.payload ?? null),
  };
}
