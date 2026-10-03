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

export interface DigestContent {
  readonly subject: string;
  readonly text: string;
  readonly html: string;
  readonly unsubscribeUrl: string;
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

const escapeHtml = (text: string) =>
  text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

export function renderDigest(input: DigestInput): DigestContent {
  const date = new Intl.DateTimeFormat("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: input.timeZone,
  });
  const lines: { text: string; href: string }[] = [];
  if (input.likes) {
    lines.push({
      text: `${plural(input.likes, "personne t'a liké", "personnes t'ont liké")} cette semaine.`,
      href: "/likes",
    });
  }
  if (input.matches) {
    lines.push({
      text: `${plural(input.matches, "nouvelle liaison", "nouvelles liaisons")}.`,
      href: "/messages",
    });
  }
  if (input.unreadConversations) {
    lines.push({
      text: `${plural(input.unreadConversations, "conversation attend", "conversations attendent")} ta réponse.`,
      href: "/messages",
    });
  }
  if (input.pactClosesAt) {
    lines.push({
      text: `Le Pacte est ouvert jusqu'au ${date.format(input.pactClosesAt)}.`,
      href: "/campus/pacte",
    });
  }
  const events = (input.events ?? []).slice(0, MAX_EVENTS);
  const base = input.appUrl.replace(/\/$/, "");
  const unsubscribeUrl = `${base}/reglages/notifications`;

  const text = [
    "Ta semaine sur Epilove",
    "",
    ...lines.map((line) => `- ${line.text}`),
    ...(events.length > 0
      ? ["", "Événements de la semaine :", ...events.map((e) => `- ${e.title}, ${date.format(e.startsAt)}`)]
      : []),
    "",
    `Ouvrir l'app : ${base}`,
    `Ne plus recevoir ce résumé : ${unsubscribeUrl}`,
  ].join("\n");

  const html = `<!doctype html>
<html lang="fr">
<body style="margin:0;background:#100e18;color:#f4f1ea;font-family:system-ui,sans-serif">
<div style="max-width:520px;margin:0 auto;padding:32px 20px">
<h1 style="font-size:24px;margin:0 0 20px">Ta semaine sur Epilove</h1>
${lines
  .map(
    (line) =>
      `<p style="margin:0 0 12px"><a href="${escapeHtml(base + line.href)}" style="color:#f4f1ea">${escapeHtml(line.text)}</a></p>`,
  )
  .join("\n")}
${
  events.length > 0
    ? `<h2 style="font-size:18px;margin:24px 0 12px">Événements de la semaine</h2>
<ul style="padding-left:20px;margin:0">
${events.map((e) => `<li style="margin:0 0 8px">${escapeHtml(e.title)}, ${escapeHtml(date.format(e.startsAt))}</li>`).join("\n")}
</ul>`
    : ""
}
<p style="margin:28px 0 0"><a href="${escapeHtml(base)}" style="display:inline-block;background:#ff3fa4;color:#100e18;padding:12px 20px;border-radius:999px;text-decoration:none;font-weight:600">Ouvrir Epilove</a></p>
<p style="margin:28px 0 0;font-size:12px;color:#9a96a6">Tu reçois ce résumé parce que tu l'as activé. <a href="${escapeHtml(unsubscribeUrl)}" style="color:#9a96a6">Ne plus le recevoir</a>.</p>
</div>
</body>
</html>`;

  return { subject: "Ta semaine sur Epilove", text, html, unsubscribeUrl };
}
