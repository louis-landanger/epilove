import type { CharterRule, ReportContext, ReportReason, Sanction } from "@epilove/core";

export const REASON: Record<ReportReason, string> = {
  harassment: "Harcèlement",
  threat: "Menaces",
  explicit_content: "Contenu sexuel",
  hate: "Haine",
  minor: "Mineur·e",
  impersonation: "Usurpation",
  outing: "Outing",
  spam: "Spam",
  not_on_campus: "Hors campus",
  other: "Autre",
};

export const CONTEXT: Record<ReportContext, string> = {
  profile: "Profil",
  photo: "Photo",
  message: "Message",
  event: "Événement",
};

export const RULE: Record<CharterRule, string> = {
  respect: "Respect",
  consent: "Consentement",
  authenticity: "Authenticité",
  discretion: "Discrétion",
  commerce: "Commerce",
  eligibility: "Éligibilité (campus)",
  minimum_age: "Âge minimum",
};

export const SANCTION: Record<Sanction, string> = {
  no_action: "Classer sans suite",
  warning: "Avertissement",
  content_removal: "Retrait du contenu",
  restriction: "Restriction",
  suspension: "Suspension",
  ban: "Bannissement",
};

export const STATUS: Record<string, string> = {
  open: "Ouvert",
  in_review: "En cours",
  resolved: "Traité",
  dismissed: "Classé",
};

/** Statement templates (DSA art. 17): facts first, then the rule. Always edited before sending. */
export const STATEMENT_TEMPLATES: Partial<Record<CharterRule, string>> = {
  respect:
    "Des messages insultants ou menaçants ont été envoyés à au moins un membre. La charte interdit les insultes, les menaces et les propos haineux.",
  consent:
    "Des contenus ou messages à caractère sexuel ont été envoyés sans être sollicités. La charte impose le consentement : aucune image sexuelle.",
  authenticity:
    "Le profil utilise des photos ou une identité qui ne sont pas les tiennes. La charte demande d'être soi-même : tes photos, ton prénom, ton âge réel.",
  discretion:
    "Des informations privées sur un autre membre ont été partagées en dehors de l'application. La charte interdit les captures partagées et l'outing.",
  commerce: "Le profil ou les messages font de la promotion ou du commerce, ce que la charte interdit.",
  eligibility:
    "Les éléments examinés montrent que tu ne fais pas partie des étudiants du campus de Lyon, à qui Epilove est réservé.",
  minimum_age:
    "Les éléments examinés montrent que tu as moins de 18 ans. Epilove est réservé aux personnes majeures.",
};
