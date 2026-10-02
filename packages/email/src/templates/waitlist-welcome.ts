import { type EmailLocale, escapeHtml, footerFor, layout, type RenderedEmail } from "./layout";

const COPY = {
  fr: {
    subject: "Tu es sur la liste d'attente",
    preheader: "Ton lien de parrainage est dedans.",
    title: "Tu es sur la liste.",
    noted: (school: string) =>
      `C'est noté : tu fais partie des premiers inscrits, et ton inscription compte pour ${school} dans la course des écoles.`,
    first: (school: string) =>
      `Tu fais partie des premiers inscrits, et ton inscription compte pour ${school} dans la course des écoles.`,
    link: "Ton lien de parrainage :",
    referral: "Chaque personne de ton école qui s'inscrit avec ce lien fait avancer ton école.",
  },
  en: {
    subject: "You're on the waiting list",
    preheader: "Your referral link is inside.",
    title: "You're on the list.",
    noted: (school: string) =>
      `Done: you're one of the first to sign up, and your sign-up counts for ${school} in the school race.`,
    first: (school: string) =>
      `You're one of the first to sign up, and your sign-up counts for ${school} in the school race.`,
    link: "Your referral link:",
    referral: "Everyone from your school who signs up with this link moves your school forward.",
  },
} as const;

/** Waiting list confirmation with the referral link (ONB-01). */
export function waitlistWelcomeEmail(options: {
  schoolName: string;
  referralUrl: string;
  locale?: EmailLocale;
}): RenderedEmail {
  const locale = options.locale ?? "fr";
  const copy = COPY[locale];
  const footer = footerFor(locale);
  const school = escapeHtml(options.schoolName);
  const url = escapeHtml(options.referralUrl);
  return {
    subject: copy.subject,
    text: [
      copy.noted(options.schoolName),
      "",
      `${copy.link} ${options.referralUrl}`,
      copy.referral,
      "",
      footer,
    ].join("\n"),
    html: layout({
      locale,
      preheader: copy.preheader,
      footer,
      body: `<p style="margin:0 0 16px 0;font-size:22px;font-weight:600;">${escapeHtml(copy.title)}</p>
<p style="margin:0 0 16px 0;">${copy.first(school)}</p>
<p style="margin:0 0 8px 0;">${escapeHtml(copy.link)}</p>
<p style="margin:0 0 16px 0;"><a href="${url}" style="color:#c2187a;font-weight:600;word-break:break-all;">${url}</a></p>
<p style="margin:0;color:#6b6578;">${escapeHtml(copy.referral)}</p>`,
    }),
  };
}
