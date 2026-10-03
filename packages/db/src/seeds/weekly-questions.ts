import { sql } from "drizzle-orm";
import type { Database } from "../client";
import { type QuestionOption, weeklyQuestion } from "../schema";

/**
 * Bank of questions of the week (COM-01), asked in this order, one per week.
 * Light campus life only: no religion, politics, health or origin (GDPR
 * art. 9), nothing that would sort people. Slugs are stable.
 */
const o = (value: string, labelFr: string, labelEn: string): QuestionOption => ({ value, labelFr, labelEn });

export const WEEKLY_QUESTIONS = [
  {
    slug: "pizza-pineapple",
    textFr: "L'ananas sur la pizza ?",
    textEn: "Pineapple on pizza?",
    options: [
      o("yes", "Oui, assumé", "Yes, proudly"),
      o("no", "Jamais", "Never"),
      o("3am", "Seulement à 3 h du matin", "Only at 3 a.m."),
    ],
  },
  {
    slug: "study-spot",
    textFr: "Le meilleur endroit pour réviser ?",
    textEn: "The best place to revise?",
    options: [
      o("library", "La bibliothèque", "The library"),
      o("cafe", "Un café", "A café"),
      o("bed", "Mon lit", "My bed"),
      o("campus-night", "Le campus, tard le soir", "Campus, late at night"),
    ],
  },
  {
    slug: "alarm",
    textFr: "Ton réveil sonne. Tu…",
    textEn: "Your alarm goes off. You…",
    options: [
      o("up", "Te lèves direct", "Get up straight away"),
      o("snooze-once", "Snoozes une fois", "Snooze once"),
      o("snooze-five", "Snoozes cinq fois", "Snooze five times"),
    ],
  },
  {
    slug: "perfect-evening",
    textFr: "La soirée parfaite ?",
    textEn: "The perfect evening?",
    options: [
      o("games", "Jeux de société", "Board games"),
      o("concert", "Un concert", "A gig"),
      o("film", "Un film sous un plaid", "A film under a blanket"),
      o("city", "Sortir en ville", "Going out in town"),
    ],
  },
  {
    slug: "group-project",
    textFr: "En projet de groupe, tu es…",
    textEn: "In a group project, you're…",
    options: [
      o("lead", "Le chef d'orchestre", "The conductor"),
      o("maker", "Celui ou celle qui fait", "The one who gets it done"),
      o("diplomat", "Le diplomate", "The diplomat"),
      o("late-genius", "En retard mais génial", "Late but brilliant"),
    ],
  },
  {
    slug: "coffee-tea",
    textFr: "Café ou thé ?",
    textEn: "Coffee or tea?",
    options: [
      o("coffee", "Café", "Coffee"),
      o("tea", "Thé", "Tea"),
      o("both", "Les deux", "Both"),
      o("neither", "Aucun", "Neither"),
    ],
  },
  {
    slug: "lyon-weekend",
    textFr: "Un dimanche à Lyon, tu vas…",
    textEn: "A Sunday in Lyon, you go…",
    options: [
      o("tete-d-or", "Au parc de la Tête d'Or", "To Tête d'Or park"),
      o("berges", "Sur les berges", "Along the river banks"),
      o("fourviere", "Monter à Fourvière", "Up to Fourvière"),
      o("bed", "Nulle part, c'est dimanche", "Nowhere, it's Sunday"),
    ],
  },
  {
    slug: "voice-notes",
    textFr: "Le message vocal de trois minutes ?",
    textEn: "The three-minute voice note?",
    options: [
      o("love", "J'adore", "Love it"),
      o("speed", "Seulement en vitesse 2×", "Only at 2× speed"),
      o("crime", "Un crime", "A crime"),
    ],
  },
  {
    slug: "first-date",
    textFr: "Le premier date idéal ?",
    textEn: "The ideal first date?",
    options: [
      o("walk", "Une balade", "A walk"),
      o("coffee", "Un café", "A coffee"),
      o("expo", "Une expo", "An exhibition"),
      o("activity", "Une activité (escalade, bowling…)", "An activity (climbing, bowling…)"),
    ],
  },
  {
    slug: "study-music",
    textFr: "Ta musique pour réviser ?",
    textEn: "Your study music?",
    options: [
      o("lofi", "Lo-fi", "Lo-fi"),
      o("rap", "Rap", "Rap"),
      o("classical", "Classique", "Classical"),
      o("silence", "Le silence", "Silence"),
    ],
  },
  {
    slug: "early-late",
    textFr: "Plutôt…",
    textEn: "More of a…",
    options: [
      o("early", "Lève-tôt", "Early bird"),
      o("late", "Couche-tard", "Night owl"),
      o("both", "Les deux, hélas", "Both, sadly"),
    ],
  },
  {
    slug: "campus-power",
    textFr: "Ton super-pouvoir de campus ?",
    textEn: "Your campus superpower?",
    options: [
      o("socket", "Trouver une prise libre", "Finding a free socket"),
      o("seat", "Toujours une place assise", "Always finding a seat"),
      o("notes", "Avoir les notes de tout le monde", "Having everyone's notes"),
      o("people", "Connaître tout le monde", "Knowing everyone"),
    ],
  },
  {
    slug: "pasta",
    textFr: "Les pâtes, c'est…",
    textEn: "Pasta is…",
    options: [
      o("meal", "Un repas", "A meal"),
      o("lifestyle", "Un mode de vie", "A lifestyle"),
      o("currency", "Une monnaie d'échange", "A currency"),
    ],
  },
  {
    slug: "holiday",
    textFr: "Les vacances idéales ?",
    textEn: "The ideal holiday?",
    options: [
      o("sea", "La mer", "The seaside"),
      o("mountain", "La montagne", "The mountains"),
      o("city", "Une capitale", "A big city"),
      o("home", "Chez soi, enfin", "Home, at last"),
    ],
  },
  {
    slug: "texting",
    textFr: "Répondre à un message, c'est…",
    textEn: "Replying to a message takes…",
    options: [
      o("instant", "Dans la minute", "A minute"),
      o("hour", "Dans l'heure", "An hour"),
      o("eventually", "Un jour, promis", "A day, someday"),
    ],
  },
  {
    slug: "cinema-seat",
    textFr: "Au cinéma, tu t'assois…",
    textEn: "At the cinema, you sit…",
    options: [
      o("front", "Devant", "At the front"),
      o("middle", "Au milieu", "In the middle"),
      o("back", "Au fond", "At the back"),
    ],
  },
] as const;

export async function seedWeeklyQuestions(db: Database): Promise<void> {
  await db
    .insert(weeklyQuestion)
    .values(
      WEEKLY_QUESTIONS.map((q, position) => ({
        slug: q.slug,
        textFr: q.textFr,
        textEn: q.textEn,
        options: [...q.options],
        position,
      })),
    )
    .onConflictDoUpdate({
      target: weeklyQuestion.slug,
      set: {
        textFr: sql`excluded.text_fr`,
        textEn: sql`excluded.text_en`,
        options: sql`excluded.options`,
        position: sql`excluded.position`,
      },
    });
}
