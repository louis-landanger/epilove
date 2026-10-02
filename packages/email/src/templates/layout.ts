/** Minimal, robust HTML for every mail client: tables, inline styles, no images, no tracking. */
export interface RenderedEmail {
  readonly subject: string;
  readonly html: string;
  readonly text: string;
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

export function layout(options: { preheader: string; body: string; footer: string }): string {
  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<title>Epilove</title>
</head>
<body style="margin:0;padding:0;background:#f6f2ea;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#100e18;">
<span style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(options.preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f2ea;">
<tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:20px;">
<tr><td style="padding:32px 32px 8px 32px;font-size:13px;letter-spacing:0.18em;text-transform:uppercase;color:#6b6578;">Epilove</td></tr>
<tr><td style="padding:8px 32px 32px 32px;font-size:16px;line-height:1.55;">${options.body}</td></tr>
</table>
<p style="max-width:480px;margin:16px auto 0;font-size:12px;line-height:1.5;color:#6b6578;">${escapeHtml(options.footer)}</p>
</td></tr>
</table>
</body>
</html>`;
}

export const FOOTER =
  "Projet étudiant indépendant, non affilié à IONIS Education Group ni aux écoles citées. Tu reçois cet email parce que ton adresse d'école a été saisie sur Epilove.";
