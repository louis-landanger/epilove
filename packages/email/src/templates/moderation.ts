import { escapeHtml, FOOTER, layout, type RenderedEmail } from "./layout";

const ACTION_LABELS = {
  warning: "un avertissement",
  content_removal: "le retrait d'un contenu",
  restriction: "une restriction de ton compte",
  suspension: "la suspension de ton compte",
  ban: "la fermeture définitive de ton compte",
} as const;

export type NotifiedSanction = keyof typeof ACTION_LABELS;

function paragraphs(lines: readonly string[]) {
  return lines.map((line) => `<p style="margin:0 0 12px 0;">${escapeHtml(line)}</p>`).join("\n");
}

/**
 * Statement of reasons sent with every sanction (DSA art. 17): the facts,
 * the rule, the measure, its duration and how to contest it.
 */
export function moderationDecisionEmail(options: {
  action: NotifiedSanction;
  rule: string;
  statement: string;
  until: Date | null;
  appealUrl: string;
}): RenderedEmail {
  const until = options.until
    ? new Intl.DateTimeFormat("fr-FR", { dateStyle: "long", timeZone: "Europe/Paris" }).format(options.until)
    : null;
  const lines = [
    `L'équipe de modération a décidé ${ACTION_LABELS[options.action]}.`,
    `Règle concernée : ${options.rule}.`,
    `Motifs : ${options.statement}`,
    ...(until ? [`Cette mesure prend fin le ${until}.`] : []),
    "Tu peux contester cette décision une fois : elle sera réexaminée par une autre personne de l'équipe.",
  ];
  return {
    subject: "Décision de modération sur ton compte Epilove",
    text: [...lines, "", `Contester : ${options.appealUrl}`, "", FOOTER].join("\n"),
    html: layout({
      preheader: "Une décision de modération concerne ton compte.",
      footer: FOOTER,
      body: `<p style="margin:0 0 16px 0;font-size:22px;font-weight:600;">Décision de modération</p>
${paragraphs(lines)}
<p style="margin:16px 0 0 0;"><a href="${escapeHtml(options.appealUrl)}" style="color:#c2187a;font-weight:600;">Contester la décision</a></p>`,
    }),
  };
}

/** To the reporter: the report was handled, without any detail on the outcome (docs/07, section A4). */
export function reportHandledEmail(): RenderedEmail {
  const lines = [
    "Ton signalement a été examiné par l'équipe de modération et une décision a été prise.",
    "Pour protéger la vie privée de chacun, on ne peut pas te donner plus de détails.",
    "Merci d'aider à garder Epilove sûr. Si tu te sens en danger, la page d'aide de l'application liste les numéros utiles.",
  ];
  return {
    subject: "Ton signalement a été traité",
    text: [...lines, "", FOOTER].join("\n"),
    html: layout({
      preheader: "Une décision a été prise.",
      footer: FOOTER,
      body: `<p style="margin:0 0 16px 0;font-size:22px;font-weight:600;">Signalement traité</p>\n${paragraphs(lines)}`,
    }),
  };
}

/** A photo was refused by moderation (ADM-01). */
export function photoRejectedEmail(reason: string): RenderedEmail {
  const lines = [
    "Une de tes photos n'a pas été validée par l'équipe de modération, elle n'est donc pas visible.",
    `Raison : ${reason}`,
    "Tu peux la remplacer depuis ton profil.",
  ];
  return {
    subject: "Une de tes photos n'a pas été validée",
    text: [...lines, "", FOOTER].join("\n"),
    html: layout({
      preheader: "Tu peux la remplacer depuis ton profil.",
      footer: FOOTER,
      body: `<p style="margin:0 0 16px 0;font-size:22px;font-weight:600;">Photo non validée</p>\n${paragraphs(lines)}`,
    }),
  };
}

/** Outcome of an appeal, reviewed by another moderator (ADM-04). */
export function appealOutcomeEmail(options: { overturned: boolean; statement: string }): RenderedEmail {
  const lines = [
    options.overturned
      ? "Ton recours a été accepté : la décision est annulée et ses effets sont levés."
      : "Ton recours a été examiné par une autre personne de l'équipe, qui a maintenu la décision.",
    `Explication : ${options.statement}`,
    "Tu peux aussi saisir un organisme de règlement extrajudiciaire des litiges certifié, ou la justice.",
  ];
  return {
    subject: options.overturned ? "Ton recours a été accepté" : "Réponse à ton recours",
    text: [...lines, "", FOOTER].join("\n"),
    html: layout({
      preheader: options.overturned ? "La décision est annulée." : "La décision est maintenue.",
      footer: FOOTER,
      body: `<p style="margin:0 0 16px 0;font-size:22px;font-weight:600;">Réponse à ton recours</p>\n${paragraphs(lines)}`,
    }),
  };
}
