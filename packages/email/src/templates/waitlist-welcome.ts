import { escapeHtml, FOOTER, layout, type RenderedEmail } from "./layout";

/** Waiting list confirmation with the referral link (ONB-01). */
export function waitlistWelcomeEmail(options: { schoolName: string; referralUrl: string }): RenderedEmail {
  const school = escapeHtml(options.schoolName);
  const url = escapeHtml(options.referralUrl);
  return {
    subject: "Tu es sur la liste d'attente",
    text: [
      `C'est noté : tu fais partie des premiers inscrits, et ton inscription compte pour ${options.schoolName} dans la course des écoles.`,
      "",
      `Ton lien de parrainage : ${options.referralUrl}`,
      "Chaque personne de ton école qui s'inscrit avec ce lien fait avancer ton école.",
      "",
      FOOTER,
    ].join("\n"),
    html: layout({
      preheader: "Ton lien de parrainage est dedans.",
      footer: FOOTER,
      body: `<p style="margin:0 0 16px 0;font-size:22px;font-weight:600;">Tu es sur la liste.</p>
<p style="margin:0 0 16px 0;">Tu fais partie des premiers inscrits, et ton inscription compte pour ${school} dans la course des écoles.</p>
<p style="margin:0 0 8px 0;">Ton lien de parrainage :</p>
<p style="margin:0 0 16px 0;"><a href="${url}" style="color:#c2187a;font-weight:600;word-break:break-all;">${url}</a></p>
<p style="margin:0;color:#6b6578;">Chaque personne de ton école qui s'inscrit avec ce lien fait avancer ton école.</p>`,
    }),
  };
}
