import { type EmailLocale, escapeHtml, heading, layout, type RenderedEmail } from "./layout";

/**
 * Weekly e-mail digest (NOT-05), opt-in per group in the notification
 * settings. Counts and campus events only: never a first name, a message or
 * a photo, because a mailbox can be seen by others.
 */
export interface DigestInput {
  /** null: the member did not ask for this group by e-mail. */
  readonly likes: number | null;
  readonly matches: number | null;
  readonly unreadConversations: number | null;
  readonly events: readonly { readonly title: string; readonly startsAt: Date }[] | null;
  readonly pactClosesAt: Date | null;
  readonly appUrl: string;
  readonly timeZone: string;
}

const MAX_EVENTS = 5;

/** Nothing worth an e-mail: no digest is sent. */
export function digestIsEmpty(input: DigestInput): boolean {
  return (
    !input.likes &&
    !input.matches &&
    !input.unreadConversations &&
    !(input.events && input.events.length > 0) &&
    !input.pactClosesAt
  );
}

const COPY = {
  fr: {
    subject: "Ta semaine sur Atomes",
    likes: (count: number) =>
      count === 1 ? "1 personne t'a liké cette semaine." : `${count} personnes t'ont liké cette semaine.`,
    matches: (count: number) => (count === 1 ? "1 nouvelle liaison." : `${count} nouvelles liaisons.`),
    unread: (count: number) =>
      count === 1 ? "1 conversation attend ta réponse." : `${count} conversations attendent ta réponse.`,
    pact: (date: string) => `Le Pacte est ouvert jusqu'au ${date}.`,
    events: "Événements de la semaine",
    open: "Ouvrir Atomes",
    openText: "Ouvrir l'app :",
    stop: "Ne plus recevoir ce résumé",
    stopText: "Ne plus recevoir ce résumé :",
    footer:
      "Projet étudiant indépendant, non affilié à IONIS Education Group ni aux écoles citées. Tu reçois ce résumé parce que tu l'as activé dans tes réglages de notifications.",
  },
  en: {
    subject: "Your week on Atomes",
    likes: (count: number) =>
      count === 1 ? "1 person liked you this week." : `${count} people liked you this week.`,
    matches: (count: number) => (count === 1 ? "1 new bond." : `${count} new bonds.`),
    unread: (count: number) =>
      count === 1
        ? "1 conversation is waiting for your reply."
        : `${count} conversations are waiting for your reply.`,
    pact: (date: string) => `The Pact is open until ${date}.`,
    events: "Events this week",
    open: "Open Atomes",
    openText: "Open the app:",
    stop: "Stop receiving this digest",
    stopText: "Stop receiving this digest:",
    footer:
      "An independent student project, not affiliated with IONIS Education Group or the schools mentioned. You are receiving this digest because you turned it on in your notification settings.",
  },
} as const;

function dateFormat(locale: EmailLocale, timeZone: string) {
  return new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
    timeZone,
  });
}

/** The digest in the member's language, with a `List-Unsubscribe` link to the settings. */
export function weeklyDigestEmail(input: DigestInput, locale: EmailLocale = "fr"): RenderedEmail {
  const copy = COPY[locale];
  const date = dateFormat(locale, input.timeZone);
  const base = input.appUrl.replace(/\/$/, "");
  const unsubscribeUrl = `${base}/reglages/notifications`;
  const lines: { text: string; href: string }[] = [];
  if (input.likes) {
    lines.push({ text: copy.likes(input.likes), href: "/likes" });
  }
  if (input.matches) {
    lines.push({ text: copy.matches(input.matches), href: "/messages" });
  }
  if (input.unreadConversations) {
    lines.push({ text: copy.unread(input.unreadConversations), href: "/messages" });
  }
  if (input.pactClosesAt) {
    lines.push({ text: copy.pact(date.format(input.pactClosesAt)), href: "/campus/pacte" });
  }
  const events = (input.events ?? []).slice(0, MAX_EVENTS).map((event) => ({
    title: event.title,
    when: date.format(event.startsAt),
  }));

  const text = [
    copy.subject,
    "",
    ...lines.map((line) => `- ${line.text}`),
    ...(events.length > 0 ? ["", `${copy.events}${locale === "fr" ? " :" : ":"}`] : []),
    ...events.map((event) => `- ${event.title}, ${event.when}`),
    "",
    `${copy.openText} ${base}`,
    `${copy.stopText} ${unsubscribeUrl}`,
    "",
    copy.footer,
  ].join("\n");

  const link = (href: string, label: string) =>
    `<a href="${escapeHtml(href)}" style="color:#100e18;">${escapeHtml(label)}</a>`;
  const body = [
    heading(copy.subject),
    ...lines.map((line) => `<p style="margin:0 0 12px 0;">${link(base + line.href, line.text)}</p>`),
    events.length > 0
      ? `<p style="margin:24px 0 8px 0;font-size:17px;font-weight:600;">${escapeHtml(copy.events)}</p>
<ul style="margin:0;padding-left:20px;">
${events.map((event) => `<li style="margin:0 0 8px 0;">${escapeHtml(event.title)}, ${escapeHtml(event.when)}</li>`).join("\n")}
</ul>`
      : "",
    `<p style="margin:24px 0 0 0;"><a href="${escapeHtml(base)}" style="color:#c2187a;font-weight:600;">${escapeHtml(copy.open)}</a></p>`,
    `<p style="margin:24px 0 0 0;font-size:13px;"><a href="${escapeHtml(unsubscribeUrl)}" style="color:#6b6578;">${escapeHtml(copy.stop)}</a></p>`,
  ]
    .filter(Boolean)
    .join("\n");

  return {
    subject: copy.subject,
    text,
    html: layout({ locale, preheader: lines[0]?.text ?? copy.subject, footer: copy.footer, body }),
    unsubscribeUrl,
  };
}
