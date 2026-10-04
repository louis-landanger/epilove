/** Minimal, robust HTML for every mail client: tables, inline styles, no images, no tracking. */
export interface RenderedEmail {
  readonly subject: string;
  readonly html: string;
  readonly text: string;
  /** Where to stop this kind of e-mail (RFC 2369 `List-Unsubscribe`), for optional e-mails only. */
  readonly unsubscribeUrl?: string;
}

const ENTITIES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ENTITIES[character] ?? character);
}

/** Same codes as `LOCALES` in `@atomes/core` (PLT-04). */
export type EmailLocale = "fr" | "en";

export function layout(options: {
  preheader: string;
  body: string;
  footer: string;
  locale?: EmailLocale;
}): string {
  return `<!doctype html>
<html lang="${options.locale ?? "fr"}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<title>Atomes</title>
</head>
<body style="margin:0;padding:0;background:#f6f2ea;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#100e18;">
<span style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(options.preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f2ea;">
<tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:20px;">
<tr><td style="padding:32px 32px 8px 32px;font-size:13px;letter-spacing:0.18em;text-transform:uppercase;color:#6b6578;">Atomes</td></tr>
<tr><td style="padding:8px 32px 32px 32px;font-size:16px;line-height:1.55;">${options.body}</td></tr>
</table>
<p style="max-width:480px;margin:16px auto 0;font-size:12px;line-height:1.5;color:#6b6578;">${escapeHtml(options.footer)}</p>
</td></tr>
</table>
</body>
</html>`;
}

const FOOTERS: Record<EmailLocale, string> = {
  fr: "Projet étudiant indépendant, non affilié à IONIS Education Group ni aux écoles citées. Tu reçois cet email parce que ton adresse d'école a été saisie sur Atomes.",
  en: "An independent student project, not affiliated with IONIS Education Group or the schools mentioned. You are receiving this email because your school address was entered on Atomes.",
};

export const FOOTER = FOOTERS.fr;

export function footerFor(locale: EmailLocale): string {
  return FOOTERS[locale];
}

/** Dates in emails: campus time zone, long format in the reader's language. */
export function longDate(date: Date, locale: EmailLocale): string {
  return new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "fr-FR", {
    dateStyle: "long",
    timeZone: "Europe/Paris",
  }).format(date);
}

export function paragraphs(lines: readonly string[]): string {
  return lines.map((line) => `<p style="margin:0 0 12px 0;">${escapeHtml(line)}</p>`).join("\n");
}

export function heading(text: string): string {
  return `<p style="margin:0 0 16px 0;font-size:22px;font-weight:600;">${escapeHtml(text)}</p>`;
}

export function button(href: string, label: string): string {
  return `<p style="margin:16px 0 0 0;"><a href="${escapeHtml(href)}" style="color:#c2187a;font-weight:600;">${escapeHtml(label)}</a></p>`;
}

/** "Label : value" with the French space before the colon, "Label: value" in English. */
export function labelled(label: string, value: string, locale: EmailLocale): string {
  return locale === "fr" ? `${label} : ${value}` : `${label}: ${value}`;
}
