import {
  button,
  type EmailLocale,
  footerFor,
  heading,
  labelled,
  layout,
  longDate,
  paragraphs,
  type RenderedEmail,
} from "./layout";

const ACTION_LABELS = {
  fr: {
    warning: "un avertissement",
    content_removal: "le retrait d'un contenu",
    restriction: "une restriction de ton compte",
    suspension: "la suspension de ton compte",
    ban: "la fermeture définitive de ton compte",
  },
  en: {
    warning: "a warning",
    content_removal: "the removal of some of your content",
    restriction: "a restriction of your account",
    suspension: "the suspension of your account",
    ban: "the permanent closure of your account",
  },
} as const;

export type NotifiedSanction = keyof (typeof ACTION_LABELS)["fr"];

/** Charter rules (`CHARTER_RULES` in `@epilove/core`), as quoted in statements of reasons. */
const RULE_LABELS: Record<EmailLocale, Record<string, string>> = {
  fr: {
    respect: "Respect des autres (charte, règle 1)",
    consent: "Consentement (charte, règle 2)",
    authenticity: "Authenticité du profil (charte, règle 3)",
    discretion: "Discrétion et vie privée (charte, règle 4)",
    commerce: "Pas de commerce ni de promotion (charte, règle 5)",
    eligibility: "Réservé aux étudiants du campus (conditions d'utilisation)",
    minimum_age: "Âge minimum de 18 ans (conditions d'utilisation)",
  },
  en: {
    respect: "Respect for others (charter, rule 1)",
    consent: "Consent (charter, rule 2)",
    authenticity: "Authentic profiles (charter, rule 3)",
    discretion: "Discretion and privacy (charter, rule 4)",
    commerce: "No selling or promotion (charter, rule 5)",
    eligibility: "Campus students only (terms of use)",
    minimum_age: "Minimum age of 18 (terms of use)",
  },
};

export function ruleLabel(rule: string, locale: EmailLocale = "fr"): string {
  return RULE_LABELS[locale][rule] ?? rule;
}

/** Photo rejection reasons (`PHOTO_REJECTION_REASONS` in `@epilove/contracts`). */
const PHOTO_REJECTION_TEXT: Record<EmailLocale, Record<string, string>> = {
  fr: {
    no_face: "on ne voit pas ton visage sur la photo principale",
    not_a_person: "la photo ne te représente pas",
    explicit: "la photo est à caractère sexuel",
    violence: "la photo montre de la violence ou des armes",
    minor: "la photo semble montrer une personne mineure",
    contact_details: "la photo contient des coordonnées ou un pseudo de réseau social",
    stolen: "la photo semble ne pas t'appartenir",
    low_quality: "la photo est trop floue ou trop sombre",
  },
  en: {
    no_face: "your face cannot be seen on the main photo",
    not_a_person: "the photo does not show you",
    explicit: "the photo is sexual in nature",
    violence: "the photo shows violence or weapons",
    minor: "the photo seems to show a minor",
    contact_details: "the photo contains contact details or a social media handle",
    stolen: "the photo does not seem to be yours",
    low_quality: "the photo is too blurry or too dark",
  },
};

const COPY = {
  fr: {
    decision: {
      subject: "Décision de modération sur ton compte Epilove",
      preheader: "Une décision de modération concerne ton compte.",
      title: "Décision de modération",
      decided: (action: string) => `L'équipe de modération a décidé ${action}.`,
      rule: (rule: string) => `Règle concernée : ${rule}.`,
      reasons: (statement: string) => `Motifs : ${statement}`,
      until: (date: string) => `Cette mesure prend fin le ${date}.`,
      appeal:
        "Tu peux contester cette décision une fois : elle sera réexaminée par une autre personne de l'équipe.",
      link: "Contester",
      button: "Contester la décision",
    },
    reportHandled: {
      subject: "Ton signalement a été traité",
      preheader: "Une décision a été prise.",
      title: "Signalement traité",
      lines: [
        "Ton signalement a été examiné par l'équipe de modération et une décision a été prise.",
        "Pour protéger la vie privée de chacun, on ne peut pas te donner plus de détails.",
        "Merci d'aider à garder Epilove sûr. Si tu te sens en danger, la page d'aide de l'application liste les numéros utiles.",
      ],
    },
    photoRejected: {
      subject: "Une de tes photos n'a pas été validée",
      preheader: "Tu peux la remplacer depuis ton profil.",
      title: "Photo non validée",
      lines: (reason: string) => [
        "Une de tes photos n'a pas été validée par l'équipe de modération, elle n'est donc pas visible.",
        `Raison : ${reason}`,
        "Tu peux la remplacer depuis ton profil.",
      ],
    },
    appeal: {
      subjectOverturned: "Ton recours a été accepté",
      subjectUpheld: "Réponse à ton recours",
      preheaderOverturned: "La décision est annulée.",
      preheaderUpheld: "La décision est maintenue.",
      title: "Réponse à ton recours",
      overturned: "Ton recours a été accepté : la décision est annulée et ses effets sont levés.",
      upheld: "Ton recours a été examiné par une autre personne de l'équipe, qui a maintenu la décision.",
      explanation: (statement: string) => `Explication : ${statement}`,
      redress:
        "Tu peux aussi saisir un organisme de règlement extrajudiciaire des litiges certifié, ou la justice.",
    },
    export: {
      subject: "Ton export de données est prêt",
      preheader: "Ton fichier est prêt.",
      title: "Ton export est prêt",
      lines: (days: number) => [
        "L'export de tes données Epilove est prêt : un fichier zip avec tes informations et tes photos.",
        `Le lien reste valable ${days} jours et ne fonctionne que si tu es connecté·e à ton compte.`,
      ],
      link: "Télécharger",
      button: "Télécharger mes données",
    },
    reverification: {
      subject: "Confirme ton adresse d'école",
      preheader: (date: string) => `Avant le ${date}.`,
      title: "Nouvelle année, même campus ?",
      lines: (date: string) => [
        "C'est la rentrée : comme chaque année, on vérifie que tu fais toujours partie du campus.",
        `Connecte-toi avec un code envoyé sur ton adresse d'école avant le ${date}. C'est tout.`,
        "Sans cela, ton profil sera mis en pause, jusqu'à ta prochaine connexion avec un code.",
      ],
      link: "Confirmer",
      button: "Confirmer mon adresse",
    },
  },
  en: {
    decision: {
      subject: "Moderation decision on your Epilove account",
      preheader: "A moderation decision concerns your account.",
      title: "Moderation decision",
      decided: (action: string) => `The moderation team decided on ${action}.`,
      rule: (rule: string) => `Rule concerned: ${rule}.`,
      reasons: (statement: string) => `Reasons: ${statement}`,
      until: (date: string) => `This measure ends on ${date}.`,
      appeal: "You can appeal this decision once: another member of the team will review it.",
      link: "Appeal",
      button: "Appeal the decision",
    },
    reportHandled: {
      subject: "Your report has been handled",
      preheader: "A decision has been made.",
      title: "Report handled",
      lines: [
        "The moderation team reviewed your report and made a decision.",
        "To protect everyone's privacy, we cannot share more details.",
        "Thank you for helping keep Epilove safe. If you feel in danger, the help page of the app lists useful numbers.",
      ],
    },
    photoRejected: {
      subject: "One of your photos was not approved",
      preheader: "You can replace it from your profile.",
      title: "Photo not approved",
      lines: (reason: string) => [
        "One of your photos was not approved by the moderation team, so it is not visible.",
        `Reason: ${reason}`,
        "You can replace it from your profile.",
      ],
    },
    appeal: {
      subjectOverturned: "Your appeal was accepted",
      subjectUpheld: "Answer to your appeal",
      preheaderOverturned: "The decision is cancelled.",
      preheaderUpheld: "The decision stands.",
      title: "Answer to your appeal",
      overturned: "Your appeal was accepted: the decision is cancelled and its effects are lifted.",
      upheld: "Another member of the team reviewed your appeal and upheld the decision.",
      explanation: (statement: string) => `Explanation: ${statement}`,
      redress:
        "You can also refer the matter to a certified out-of-court dispute settlement body, or to the courts.",
    },
    export: {
      subject: "Your data export is ready",
      preheader: "Your file is ready.",
      title: "Your export is ready",
      lines: (days: number) => [
        "Your Epilove data export is ready: a zip file with your information and your photos.",
        `The link stays valid for ${days} days and only works when you are signed in to your account.`,
      ],
      link: "Download",
      button: "Download my data",
    },
    reverification: {
      subject: "Confirm your school address",
      preheader: (date: string) => `Before ${date}.`,
      title: "New year, same campus?",
      lines: (date: string) => [
        "A new academic year has started: as every year, we check that you are still part of the campus.",
        `Sign in with a code sent to your school address before ${date}. That's all.`,
        "Otherwise, your profile will be paused until you next sign in with a code.",
      ],
      link: "Confirm",
      button: "Confirm my address",
    },
  },
} as const;

/**
 * Statement of reasons sent with every sanction (DSA art. 17): the facts,
 * the rule, the measure, its duration and how to contest it.
 */
export function moderationDecisionEmail(options: {
  action: NotifiedSanction;
  /** Charter rule code, see `ruleLabel`. */
  rule: string;
  statement: string;
  until: Date | null;
  appealUrl: string;
  locale?: EmailLocale;
}): RenderedEmail {
  const locale = options.locale ?? "fr";
  const copy = COPY[locale].decision;
  const footer = footerFor(locale);
  const lines = [
    copy.decided(ACTION_LABELS[locale][options.action]),
    copy.rule(ruleLabel(options.rule, locale)),
    copy.reasons(options.statement),
    ...(options.until ? [copy.until(longDate(options.until, locale))] : []),
    copy.appeal,
  ];
  return {
    subject: copy.subject,
    text: [...lines, "", labelled(copy.link, options.appealUrl, locale), "", footer].join("\n"),
    html: layout({
      locale,
      preheader: copy.preheader,
      footer,
      body: `${heading(copy.title)}\n${paragraphs(lines)}\n${button(options.appealUrl, copy.button)}`,
    }),
  };
}

/** To the reporter: the report was handled, without any detail on the outcome (docs/07, section A4). */
export function reportHandledEmail(locale: EmailLocale = "fr"): RenderedEmail {
  const copy = COPY[locale].reportHandled;
  const footer = footerFor(locale);
  return {
    subject: copy.subject,
    text: [...copy.lines, "", footer].join("\n"),
    html: layout({
      locale,
      preheader: copy.preheader,
      footer,
      body: `${heading(copy.title)}\n${paragraphs(copy.lines)}`,
    }),
  };
}

/** A photo was refused by moderation (ADM-01). */
export function photoRejectedEmail(reason: string, locale: EmailLocale = "fr"): RenderedEmail {
  const copy = COPY[locale].photoRejected;
  const footer = footerFor(locale);
  const lines = copy.lines(PHOTO_REJECTION_TEXT[locale][reason] ?? reason);
  return {
    subject: copy.subject,
    text: [...lines, "", footer].join("\n"),
    html: layout({
      locale,
      preheader: copy.preheader,
      footer,
      body: `${heading(copy.title)}\n${paragraphs(lines)}`,
    }),
  };
}

/** Outcome of an appeal, reviewed by another moderator (ADM-04). */
export function appealOutcomeEmail(options: {
  overturned: boolean;
  statement: string;
  locale?: EmailLocale;
}): RenderedEmail {
  const locale = options.locale ?? "fr";
  const copy = COPY[locale].appeal;
  const footer = footerFor(locale);
  const lines = [
    options.overturned ? copy.overturned : copy.upheld,
    copy.explanation(options.statement),
    copy.redress,
  ];
  return {
    subject: options.overturned ? copy.subjectOverturned : copy.subjectUpheld,
    text: [...lines, "", footer].join("\n"),
    html: layout({
      locale,
      preheader: options.overturned ? copy.preheaderOverturned : copy.preheaderUpheld,
      footer,
      body: `${heading(copy.title)}\n${paragraphs(lines)}`,
    }),
  };
}

/** The data export is ready (SAF-14). The link requires being signed in. */
export function dataExportReadyEmail(
  downloadUrl: string,
  days: number,
  locale: EmailLocale = "fr",
): RenderedEmail {
  const copy = COPY[locale].export;
  const footer = footerFor(locale);
  const lines = copy.lines(days);
  return {
    subject: copy.subject,
    text: [...lines, "", labelled(copy.link, downloadUrl, locale), "", footer].join("\n"),
    html: layout({
      locale,
      preheader: copy.preheader,
      footer,
      body: `${heading(copy.title)}\n${paragraphs(lines)}\n${button(downloadUrl, copy.button)}`,
    }),
  };
}

/** Yearly re-verification reminder (ONB-09): a sign-in with a code is enough. */
export function reverificationReminderEmail(
  deadline: Date,
  verifyUrl: string,
  locale: EmailLocale = "fr",
): RenderedEmail {
  const copy = COPY[locale].reverification;
  const footer = footerFor(locale);
  const date = longDate(deadline, locale);
  const lines = copy.lines(date);
  return {
    subject: copy.subject,
    text: [...lines, "", labelled(copy.link, verifyUrl, locale), "", footer].join("\n"),
    html: layout({
      locale,
      preheader: copy.preheader(date),
      footer,
      body: `${heading(copy.title)}\n${paragraphs(lines)}\n${button(verifyUrl, copy.button)}`,
    }),
  };
}
