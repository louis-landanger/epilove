import type { Database } from "../client";
import { prompt } from "../schema";

/** Prompt catalogue (PRO-02): campus-flavoured, never sexual, answerable in 200 characters. */
export const PROMPTS: ReadonlyArray<{ slug: string; category: string; fr: string; en: string }> = [
  {
    slug: "campus-spot",
    category: "campus",
    fr: "Le spot du campus où on me trouve…",
    en: "The campus spot where you'll find me…",
  },
  {
    slug: "worst-bug",
    category: "campus",
    fr: "Ma pire galère de TP ou de projet…",
    en: "My worst lab or project disaster…",
  },
  {
    slug: "could-teach",
    category: "campus",
    fr: "La matière que je pourrais enseigner les yeux fermés…",
    en: "The subject I could teach with my eyes closed…",
  },
  {
    slug: "group-project-role",
    category: "campus",
    fr: "En projet de groupe, je suis celui ou celle qui…",
    en: "In group projects, I'm the one who…",
  },
  {
    slug: "exam-strategy",
    category: "campus",
    fr: "Ma stratégie de révision, en toute honnêteté…",
    en: "My revision strategy, honestly…",
  },
  {
    slug: "bde-memory",
    category: "campus",
    fr: "Le meilleur souvenir de soirée que je peux raconter ici…",
    en: "The best party memory I can share here…",
  },
  {
    slug: "after-graduation",
    category: "campus",
    fr: "Après le diplôme, je me vois…",
    en: "After graduating, I see myself…",
  },
  {
    slug: "proud-project",
    category: "campus",
    fr: "Le projet dont je suis le plus fier ou la plus fière…",
    en: "The project I'm proudest of…",
  },
  {
    slug: "lyon-sunday",
    category: "lyon",
    fr: "Mon plan parfait pour un dimanche à Lyon…",
    en: "My perfect Sunday in Lyon…",
  },
  {
    slug: "lyon-secret",
    category: "lyon",
    fr: "Un coin de Lyon que tout le monde devrait connaître…",
    en: "A corner of Lyon everyone should know…",
  },
  {
    slug: "lyon-food",
    category: "lyon",
    fr: "Le meilleur endroit pour manger pas cher à Lyon…",
    en: "The best cheap eats in Lyon…",
  },
  {
    slug: "first-date-idea",
    category: "date",
    fr: "Mon idée de premier date idéal…",
    en: "My ideal first date…",
  },
  {
    slug: "green-flag",
    category: "date",
    fr: "Mon green flag le plus sous-coté…",
    en: "My most underrated green flag…",
  },
  { slug: "dealbreaker", category: "date", fr: "Rédhibitoire pour moi…", en: "A dealbreaker for me…" },
  {
    slug: "win-me-over",
    category: "date",
    fr: "Le moyen le plus sûr de me faire rire…",
    en: "The surest way to make me laugh…",
  },
  {
    slug: "looking-for",
    category: "date",
    fr: "Je cherche quelqu'un qui…",
    en: "I'm looking for someone who…",
  },
  { slug: "together-we", category: "date", fr: "On s'entendra bien si…", en: "We'll get along if…" },
  {
    slug: "convince-you",
    category: "personality",
    fr: "Je te convaincs en un argument que…",
    en: "I can convince you in one argument that…",
  },
  { slug: "hot-take", category: "personality", fr: "Mon avis impopulaire…", en: "My unpopular opinion…" },
  {
    slug: "simple-pleasure",
    category: "personality",
    fr: "Mon petit plaisir simple…",
    en: "My simple pleasure…",
  },
  {
    slug: "never-shut-up",
    category: "personality",
    fr: "Le sujet sur lequel je suis intarissable…",
    en: "The topic I can't stop talking about…",
  },
  {
    slug: "irrational-fear",
    category: "personality",
    fr: "Ma peur la plus irrationnelle…",
    en: "My most irrational fear…",
  },
  {
    slug: "friends-describe",
    category: "personality",
    fr: "Mes amis me décrivent comme…",
    en: "My friends describe me as…",
  },
  {
    slug: "learning-now",
    category: "personality",
    fr: "En ce moment, j'apprends…",
    en: "Right now I'm learning…",
  },
  {
    slug: "comfort-thing",
    category: "personality",
    fr: "Mon film, ma série ou mon jeu doudou…",
    en: "My comfort film, show or game…",
  },
  {
    slug: "weekend",
    category: "personality",
    fr: "Un week-end typique, pour moi, c'est…",
    en: "A typical weekend for me is…",
  },
  {
    slug: "two-truths",
    category: "personality",
    fr: "Deux vérités et un mensonge…",
    en: "Two truths and a lie…",
  },
  {
    slug: "tabs-spaces",
    category: "nerd",
    fr: "Tabulations ou espaces, et pourquoi c'est important…",
    en: "Tabs or spaces, and why it matters…",
  },
  { slug: "setup", category: "nerd", fr: "Mon setup, en une phrase…", en: "My setup, in one sentence…" },
  {
    slug: "useless-skill",
    category: "nerd",
    fr: "Ma compétence la plus inutile…",
    en: "My most useless skill…",
  },
  {
    slug: "fun-fact",
    category: "nerd",
    fr: "Le fun fact scientifique que je ressors en soirée…",
    en: "The science fun fact I bring up at parties…",
  },
  {
    slug: "rabbit-hole",
    category: "nerd",
    fr: "Le dernier sujet sur lequel je me suis perdu·e à 2 h du matin…",
    en: "The last rabbit hole I fell into at 2 a.m.…",
  },
  {
    slug: "superpower",
    category: "nerd",
    fr: "Le super-pouvoir le plus utile pour mes études…",
    en: "The most useful superpower for my studies…",
  },
  {
    slug: "care-about",
    category: "values",
    fr: "Une cause qui compte pour moi…",
    en: "A cause that matters to me…",
  },
  {
    slug: "value-most",
    category: "values",
    fr: "Ce que je respecte le plus chez quelqu'un…",
    en: "What I respect most in someone…",
  },
  {
    slug: "changed-mind",
    category: "values",
    fr: "La dernière fois que j'ai changé d'avis…",
    en: "The last time I changed my mind…",
  },
  {
    slug: "bucket-list",
    category: "values",
    fr: "Sur ma liste de choses à faire avant la fin des études…",
    en: "On my list before I graduate…",
  },
  {
    slug: "travel",
    category: "values",
    fr: "Le voyage qui m'a le plus marqué·e…",
    en: "The trip that changed me most…",
  },
  {
    slug: "song",
    category: "music",
    fr: "La chanson que je mets pour me motiver…",
    en: "The song I play to get going…",
  },
  {
    slug: "concert",
    category: "music",
    fr: "Le meilleur concert ou festival de ma vie…",
    en: "The best gig or festival of my life…",
  },
];

export async function seedPrompts(db: Database) {
  for (const entry of PROMPTS) {
    await db
      .insert(prompt)
      .values({ slug: entry.slug, category: entry.category, textFr: entry.fr, textEn: entry.en })
      .onConflictDoUpdate({
        target: prompt.slug,
        set: { category: entry.category, textFr: entry.fr, textEn: entry.en, active: true },
      });
  }
}
