import { sql } from "drizzle-orm";
import type { Database } from "../client";
import { type QuestionOption, question } from "../schema";

/**
 * Compatibility questionnaire (PAC-01, docs/06-matching.md, section 3).
 *
 * Rules: no question about religion, politics, health or origin (sensitive
 * data under GDPR art. 9), no psychometric pretension, campus humour welcome.
 * Slugs are stable: a reworded question keeps its slug and gets a new
 * `version`; a retired question is deactivated, never deleted.
 */
export const QUESTION_SECTIONS = ["values", "lifestyle", "campus", "nerd", "plans"] as const;
export type QuestionSection = (typeof QUESTION_SECTIONS)[number];

export interface QuestionDefinition {
  readonly slug: string;
  readonly section: QuestionSection;
  readonly textFr: string;
  readonly textEn: string;
  readonly options: readonly QuestionOption[];
  readonly pactOnly?: boolean;
}

const o = (value: string, labelFr: string, labelEn: string): QuestionOption => ({ value, labelFr, labelEn });

export const QUESTIONS: readonly QuestionDefinition[] = [
  // Valeurs
  {
    slug: "values-relationship-core",
    section: "values",
    textFr: "Dans une relation, ce qui compte le plus pour toi ?",
    textEn: "What matters most to you in a relationship?",
    options: [
      o("trust", "La confiance", "Trust"),
      o("fun", "Rire ensemble", "Laughing together"),
      o("growth", "Se faire grandir", "Helping each other grow"),
      o("freedom", "Garder sa liberté", "Keeping your freedom"),
    ],
  },
  {
    slug: "values-honesty",
    section: "values",
    textFr: "Une vérité qui pique ou un petit mensonge qui arrange ?",
    textEn: "A truth that stings or a white lie that helps?",
    options: [
      o("truth", "La vérité, toujours", "The truth, always"),
      o("depends", "Ça dépend du contexte", "It depends"),
      o("kind", "La gentillesse avant tout", "Kindness first"),
    ],
  },
  {
    slug: "values-conflict",
    section: "values",
    textFr: "Quand il y a un désaccord, tu préfères…",
    textEn: "When you disagree, you would rather…",
    options: [
      o("talk-now", "En parler tout de suite", "Talk it through right away"),
      o("cool-down", "Prendre du recul puis en parler", "Cool down, then talk"),
      o("let-go", "Laisser couler si ce n'est pas grave", "Let it go if it's minor"),
    ],
  },
  {
    slug: "values-time-together",
    section: "values",
    textFr: "En couple, le temps passé ensemble idéal ?",
    textEn: "In a relationship, ideal time together?",
    options: [
      o("most", "Presque tout le temps", "Almost all the time"),
      o("balanced", "Un bon équilibre", "A good balance"),
      o("independent", "Chacun sa vie, des moments forts", "Separate lives, great moments"),
    ],
  },
  {
    slug: "values-friends-role",
    section: "values",
    textFr: "La place de tes amis dans ta vie amoureuse ?",
    textEn: "Where do your friends fit in your love life?",
    options: [
      o("central", "Ils doivent valider", "They need to approve"),
      o("mixed", "On mélange les deux groupes", "Our groups mix"),
      o("separate", "Deux mondes séparés", "Two separate worlds"),
    ],
  },
  {
    slug: "values-chores",
    section: "values",
    textFr: "Le partage des tâches en colocation ou en couple ?",
    textEn: "Sharing chores with a flatmate or partner?",
    options: [
      o("strict", "Tableau et tours précis", "Rota and strict turns"),
      o("flexible", "Chacun fait ce qu'il voit", "Everyone does what they see"),
      o("talents", "Selon les talents de chacun", "Based on who's good at what"),
    ],
  },
  {
    slug: "values-ambition",
    section: "values",
    textFr: "Réussir sa vie, pour toi, c'est d'abord…",
    textEn: "A successful life is first of all…",
    options: [
      o("career", "Une carrière qui compte", "A career that matters"),
      o("people", "Les gens qu'on aime", "The people you love"),
      o("experiences", "Des expériences à raconter", "Stories to tell"),
      o("peace", "Être en paix avec soi", "Being at peace with yourself"),
    ],
  },
  {
    slug: "values-money",
    section: "values",
    textFr: "Ton rapport à l'argent ?",
    textEn: "Your relationship with money?",
    options: [
      o("saver", "Fourmi : j'épargne", "Ant: I save"),
      o("balanced", "Raisonnable avec des plaisirs", "Sensible with treats"),
      o("spender", "Cigale : la vie est courte", "Grasshopper: life is short"),
    ],
  },
  {
    slug: "values-texting",
    section: "values",
    textFr: "Le « vu » sans réponse pendant deux jours…",
    textEn: "Being left on read for two days…",
    options: [
      o("dealbreaker", "Rédhibitoire", "A dealbreaker"),
      o("meh", "Pas idéal, mais ça arrive", "Not great, but it happens"),
      o("fine", "Aucun souci, chacun son rythme", "No problem, everyone has their pace"),
    ],
  },

  // Mode de vie
  {
    slug: "lifestyle-chronotype",
    section: "lifestyle",
    textFr: "Lève-tôt ou couche-tard ?",
    textEn: "Early bird or night owl?",
    options: [
      o("early", "Lève-tôt", "Early bird"),
      o("between", "Entre les deux", "Somewhere in between"),
      o("late", "Couche-tard", "Night owl"),
    ],
  },
  {
    slug: "lifestyle-weekend",
    section: "lifestyle",
    textFr: "Ton week-end idéal ?",
    textEn: "Your ideal weekend?",
    options: [
      o("party", "Soirées et sorties", "Parties and nights out"),
      o("outdoors", "Nature et grand air", "Nature and fresh air"),
      o("cozy", "Plaid, série, cuisine", "Blanket, series, cooking"),
      o("culture", "Expo, concert, ciné", "Exhibitions, gigs, cinema"),
    ],
  },
  {
    slug: "lifestyle-sport",
    section: "lifestyle",
    textFr: "Le sport, pour toi ?",
    textEn: "Sport, for you?",
    options: [
      o("daily", "Tous les jours ou presque", "Daily or close to it"),
      o("weekly", "Une ou deux fois par semaine", "Once or twice a week"),
      o("sometimes", "Quand j'y pense", "When I remember"),
      o("never", "Je préfère regarder", "I'd rather watch"),
    ],
  },
  {
    slug: "lifestyle-parties",
    section: "lifestyle",
    textFr: "Les soirées BDE ?",
    textEn: "Student union parties?",
    options: [
      o("all", "Je ne les rate jamais", "Never miss one"),
      o("some", "Les meilleures seulement", "Only the best ones"),
      o("rarely", "Très peu pour moi", "Not really my thing"),
    ],
  },
  {
    slug: "lifestyle-party-style",
    section: "lifestyle",
    textFr: "En soirée, tu es plutôt…",
    textEn: "At a party, you're more…",
    options: [
      o("dancefloor", "Sur la piste", "On the dance floor"),
      o("deep-talks", "En grande discussion dans la cuisine", "Deep in conversation in the kitchen"),
      o("early-exit", "Au lit avant minuit", "Gone before midnight"),
      o("organiser", "Aux commandes de l'orga", "The one organising it"),
    ],
  },
  {
    slug: "lifestyle-food",
    section: "lifestyle",
    textFr: "En cuisine, tu es…",
    textEn: "In the kitchen, you are…",
    options: [
      o("chef", "Top chef", "A real chef"),
      o("basics", "Pâtes au pesto, maîtrisées", "Pesto pasta, mastered"),
      o("delivery", "Fidèle aux livreurs", "Best friends with delivery riders"),
    ],
  },
  {
    slug: "lifestyle-tidy",
    section: "lifestyle",
    textFr: "Ta chambre, là, maintenant ?",
    textEn: "Your room, right now?",
    options: [
      o("spotless", "Impeccable", "Spotless"),
      o("organised-chaos", "Désordre organisé", "Organised chaos"),
      o("archaeology", "Un chantier de fouilles", "An archaeological dig"),
    ],
  },
  {
    slug: "lifestyle-travel",
    section: "lifestyle",
    textFr: "En voyage, tu préfères…",
    textEn: "When travelling, you prefer…",
    options: [
      o("planned", "Tout prévoir à l'avance", "Planning everything"),
      o("improvised", "Improviser sur place", "Improvising on the spot"),
      o("mix", "Un plan, mais souple", "A loose plan"),
    ],
  },
  {
    slug: "lifestyle-pets",
    section: "lifestyle",
    textFr: "Team chat ou team chien ?",
    textEn: "Cat person or dog person?",
    options: [
      o("cat", "Chat", "Cat"),
      o("dog", "Chien", "Dog"),
      o("both", "Les deux", "Both"),
      o("none", "Ni l'un ni l'autre", "Neither"),
    ],
  },

  // Campus
  {
    slug: "campus-lecture-seat",
    section: "campus",
    textFr: "Ta place en amphi ?",
    textEn: "Your seat in the lecture hall?",
    options: [
      o("front", "Premier rang", "Front row"),
      o("middle", "Au milieu, discret", "Middle, low-key"),
      o("back", "Dernier rang", "Back row"),
      o("remote", "En distanciel dans mon lit", "Remotely, from bed"),
    ],
  },
  {
    slug: "campus-group-project",
    section: "campus",
    textFr: "En projet de groupe, tu es…",
    textEn: "In a group project, you are…",
    options: [
      o("leader", "À la tête du projet", "The project lead"),
      o("worker", "Qui abat tout le travail", "The one doing the work"),
      o("ideas", "La boîte à idées", "The ideas person"),
      o("ghost", "Le fantôme", "The ghost"),
    ],
  },
  {
    slug: "campus-revision",
    section: "campus",
    textFr: "Ta méthode de révision ?",
    textEn: "How do you revise?",
    options: [
      o("early", "Régulièrement, dès le début", "Steadily, from day one"),
      o("week-before", "La semaine d'avant", "The week before"),
      o("night-before", "La nuit d'avant, au café", "The night before, on coffee"),
    ],
  },
  {
    slug: "campus-study-spot",
    section: "campus",
    textFr: "Ton spot pour bosser ?",
    textEn: "Where do you study?",
    options: [
      o("library", "La bibliothèque, en silence", "The library, in silence"),
      o("cafe", "Un café avec du bruit", "A busy café"),
      o("home", "Chez moi", "At home"),
      o("campus", "Les salles du campus", "Campus study rooms"),
    ],
  },
  {
    slug: "campus-associations",
    section: "campus",
    textFr: "La vie associative ?",
    textEn: "Student associations?",
    options: [
      o("core", "Je suis dans le bureau", "I'm on the board"),
      o("member", "Membre de quelques assos", "Member of a few"),
      o("none", "Pas pour moi", "Not for me"),
    ],
  },
  {
    slug: "campus-lunch",
    section: "campus",
    textFr: "Le midi, tu manges…",
    textEn: "At lunchtime, you eat…",
    options: [
      o("canteen", "Au resto U ou au campus", "At the campus canteen"),
      o("lunchbox", "Ma gamelle", "My packed lunch"),
      o("outside", "Dehors avec la bande", "Out with the crew"),
      o("skip", "Je saute le repas", "I skip lunch"),
    ],
  },
  {
    slug: "campus-deadline",
    section: "campus",
    textFr: "Un rendu à minuit. Il est 23 h 50.",
    textEn: "Deadline at midnight. It's 11:50 pm.",
    options: [
      o("done", "Rendu depuis trois jours", "Submitted three days ago"),
      o("finishing", "Je relis une dernière fois", "Final proofread"),
      o("panic", "Je commence à peine", "Just getting started"),
    ],
  },
  {
    slug: "campus-mixing",
    section: "campus",
    textFr: "Rencontrer des gens d'autres écoles ?",
    textEn: "Meeting people from other schools?",
    options: [
      o("love", "C'est tout l'intérêt", "That's the whole point"),
      o("open", "Avec plaisir", "Happy to"),
      o("indifferent", "Indifférent", "Don't mind either way"),
    ],
  },
  {
    slug: "campus-exchange",
    section: "campus",
    textFr: "Un semestre à l'étranger ?",
    textEn: "A semester abroad?",
    options: [
      o("yes", "Évidemment", "Obviously"),
      o("maybe", "Pourquoi pas", "Why not"),
      o("no", "Lyon me suffit", "Lyon is enough for me"),
    ],
  },

  // Humour et nerd
  {
    slug: "nerd-pineapple",
    section: "nerd",
    textFr: "L'ananas sur la pizza ?",
    textEn: "Pineapple on pizza?",
    options: [
      o("yes", "Oui, assumé", "Yes, proudly"),
      o("no", "Crime contre l'Italie", "A crime against Italy"),
      o("whatever", "Je mange de tout", "I'll eat anything"),
    ],
  },
  {
    slug: "nerd-tabs-spaces",
    section: "nerd",
    textFr: "Tabulations ou espaces ?",
    textEn: "Tabs or spaces?",
    options: [
      o("tabs", "Tabulations", "Tabs"),
      o("spaces", "Espaces", "Spaces"),
      o("formatter", "Le formateur décide", "The formatter decides"),
      o("what", "De quoi on parle ?", "What are we talking about?"),
    ],
  },
  {
    slug: "nerd-dark-mode",
    section: "nerd",
    textFr: "Mode sombre ou mode clair ?",
    textEn: "Dark mode or light mode?",
    options: [
      o("dark", "Sombre, évidemment", "Dark, obviously"),
      o("light", "Clair", "Light"),
      o("auto", "Selon l'heure", "Depends on the time"),
    ],
  },
  {
    slug: "nerd-humour",
    section: "nerd",
    textFr: "Ton humour ?",
    textEn: "Your sense of humour?",
    options: [
      o("absurd", "Absurde", "Absurd"),
      o("sarcastic", "Sarcastique", "Sarcastic"),
      o("puns", "Jeux de mots douteux", "Questionable puns"),
      o("memes", "Mèmes uniquement", "Memes only"),
    ],
  },
  {
    slug: "nerd-games",
    section: "nerd",
    textFr: "Les jeux vidéo ?",
    textEn: "Video games?",
    options: [
      o("hardcore", "Classement compétitif", "Ranked, competitive"),
      o("casual", "De temps en temps", "Now and then"),
      o("cozy", "Jeux cosy uniquement", "Cozy games only"),
      o("none", "Pas du tout", "Not at all"),
    ],
  },
  {
    slug: "nerd-board-games",
    section: "nerd",
    textFr: "Soirée jeux de société ?",
    textEn: "Board game night?",
    options: [
      o("competitive", "Je joue pour gagner", "I play to win"),
      o("fun", "Pour rigoler", "Just for fun"),
      o("pass", "Je passe mon tour", "I'll pass"),
    ],
  },
  {
    slug: "nerd-series",
    section: "nerd",
    textFr: "Une série, tu la regardes…",
    textEn: "You watch a series…",
    options: [
      o("binge", "En une nuit", "In one night"),
      o("weekly", "Un épisode à la fois", "One episode at a time"),
      o("never-finish", "Je ne finis jamais rien", "I never finish anything"),
    ],
  },
  {
    slug: "nerd-music",
    section: "nerd",
    textFr: "La musique dans ta vie ?",
    textEn: "Music in your life?",
    options: [
      o("always", "Écouteurs vissés", "Earphones always in"),
      o("concerts", "Surtout en concert", "Mostly at gigs"),
      o("background", "En fond sonore", "In the background"),
    ],
  },
  {
    slug: "nerd-debate",
    section: "nerd",
    textFr: "Un débat absurde à 2 h du matin ?",
    textEn: "A ridiculous debate at 2 am?",
    options: [
      o("yes", "Mon sport préféré", "My favourite sport"),
      o("depends", "Si le sujet est bon", "If the topic is good"),
      o("sleep", "Je dors", "I'm asleep"),
    ],
  },

  // Projets
  {
    slug: "plans-city",
    section: "plans",
    textFr: "Après les études, tu te vois…",
    textEn: "After graduation, you see yourself…",
    options: [
      o("lyon", "Rester à Lyon", "Staying in Lyon"),
      o("paris", "À Paris", "In Paris"),
      o("abroad", "À l'étranger", "Abroad"),
      o("unknown", "Aucune idée", "No idea"),
    ],
  },
  {
    slug: "plans-pace",
    section: "plans",
    textFr: "Le rythme de vie que tu vises ?",
    textEn: "The pace of life you're aiming for?",
    options: [
      o("intense", "Intense et ambitieux", "Intense and ambitious"),
      o("balanced", "Équilibré", "Balanced"),
      o("slow", "Tranquille", "Slow and easy"),
    ],
  },
  {
    slug: "plans-commitment",
    section: "plans",
    textFr: "Une relation sérieuse, maintenant ?",
    textEn: "A serious relationship, right now?",
    options: [
      o("yes", "C'est ce que je cherche", "That's what I'm looking for"),
      o("open", "Si ça vient, pourquoi pas", "If it happens, why not"),
      o("not-now", "Pas pour l'instant", "Not for now"),
    ],
  },
  {
    slug: "plans-first-date",
    section: "plans",
    textFr: "Le premier date idéal ?",
    textEn: "The ideal first date?",
    options: [
      o("coffee", "Un café, simple", "A simple coffee"),
      o("walk", "Une balade sur les quais", "A walk along the river"),
      o("activity", "Une activité (escape game, expo…)", "An activity (escape room, exhibition…)"),
      o("drink", "Un verre en terrasse", "A drink on a terrace"),
    ],
  },
  {
    slug: "plans-who-pays",
    section: "plans",
    textFr: "Au premier date, l'addition ?",
    textEn: "On a first date, the bill?",
    options: [
      o("split", "Moitié-moitié", "Split it"),
      o("inviter", "Celui ou celle qui invite", "Whoever asked"),
      o("alternate", "Chacun son tour", "Take turns"),
    ],
  },
  {
    slug: "plans-side-project",
    section: "plans",
    textFr: "Un projet perso en cours ?",
    textEn: "A side project on the go?",
    options: [
      o("many", "Trois, aucun fini", "Three, none finished"),
      o("one", "Un, et j'y crois", "One, and I believe in it"),
      o("none", "Les cours me suffisent", "Classes are enough"),
    ],
  },
  {
    slug: "plans-summer",
    section: "plans",
    textFr: "Cet été, plutôt…",
    textEn: "This summer, more like…",
    options: [
      o("internship", "Stage à fond", "Internship, all in"),
      o("travel", "Sac à dos", "Backpacking"),
      o("job", "Job d'été", "Summer job"),
      o("rest", "Repos bien mérité", "Well-earned rest"),
    ],
  },
  {
    slug: "plans-languages",
    section: "plans",
    textFr: "Apprendre une nouvelle langue ?",
    textEn: "Learning a new language?",
    options: [
      o("learning", "J'en apprends une", "I'm learning one"),
      o("someday", "Un jour", "Someday"),
      o("no", "Pas prévu", "Not planned"),
    ],
  },
  {
    slug: "plans-sunday-lyon",
    section: "plans",
    textFr: "Un dimanche parfait à Lyon ?",
    textEn: "A perfect Sunday in Lyon?",
    options: [
      o("parc", "Parc de la Tête d'Or", "Parc de la Tête d'Or"),
      o("fourviere", "Montée à Fourvière", "Climbing up to Fourvière"),
      o("brunch", "Brunch dans le Vieux Lyon", "Brunch in Vieux Lyon"),
      o("quais", "Les quais du Rhône", "The banks of the Rhône"),
    ],
  },
];

/** Idempotent: upserts the catalogue by slug, keeping existing ids (and therefore answers). */
export async function seedQuestions(db: Database) {
  if (QUESTIONS.length === 0) {
    return;
  }
  await db
    .insert(question)
    .values(
      QUESTIONS.map((definition, index) => ({
        slug: definition.slug,
        section: definition.section,
        textFr: definition.textFr,
        textEn: definition.textEn,
        options: [...definition.options],
        position: index,
        pactOnly: definition.pactOnly ?? false,
      })),
    )
    .onConflictDoUpdate({
      target: question.slug,
      set: {
        section: sql`excluded.section`,
        textFr: sql`excluded.text_fr`,
        textEn: sql`excluded.text_en`,
        options: sql`excluded.options`,
        position: sql`excluded.position`,
        pactOnly: sql`excluded.pact_only`,
      },
    });
}
