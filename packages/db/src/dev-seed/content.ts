/**
 * Text content of the development data set: invented first names, campus
 * prompts and answers, conversation lines. Everything is fictional.
 */

export const FIRST_NAMES = {
  woman: [
    "Inès",
    "Léa",
    "Chloé",
    "Manon",
    "Camille",
    "Sarah",
    "Emma",
    "Jade",
    "Louise",
    "Alice",
    "Lina",
    "Zoé",
    "Clara",
    "Anaïs",
    "Yasmine",
    "Maëlys",
    "Nour",
    "Juliette",
    "Lou",
    "Margaux",
    "Salomé",
    "Elsa",
    "Romane",
    "Aya",
    "Mélissa",
    "Océane",
    "Lucie",
    "Mila",
    "Héloïse",
    "Fatou",
    "Agathe",
    "Lisa",
    "Amira",
    "Eva",
    "Capucine",
    "Naïma",
    "Pauline",
    "Iris",
    "Victoire",
    "Mei",
  ],
  man: [
    "Hugo",
    "Lucas",
    "Malik",
    "Nathan",
    "Théo",
    "Adam",
    "Louis",
    "Gabriel",
    "Yanis",
    "Raphaël",
    "Arthur",
    "Enzo",
    "Mathis",
    "Noah",
    "Rayan",
    "Tom",
    "Jules",
    "Sacha",
    "Ilyes",
    "Antoine",
    "Maxime",
    "Baptiste",
    "Samuel",
    "Bilal",
    "Clément",
    "Victor",
    "Oscar",
    "Kenji",
    "Paul",
    "Elias",
    "Mehdi",
    "Quentin",
    "Lorenzo",
    "Axel",
    "Aurélien",
    "Timéo",
    "Youssef",
    "Martin",
    "Nils",
    "Diego",
  ],
  nonbinary: ["Camille", "Sasha", "Charlie", "Alex", "Andréa", "Noa", "Eden", "Morgan", "Lou", "Ange"],
} as const;

export const PRONOUNS = { woman: "elle", man: "il", nonbinary: "iel" } as const;

export const PROGRAMS: Readonly<Record<string, readonly string[]>> = {
  epita: ["Cycle prépa", "Cycle ingénieur", "Majeure sécurité", "Majeure image", "Majeure IA"],
  esme: ["Prépa intégrée", "Énergie", "Systèmes embarqués", "Robotique", "Santé et biotech"],
  supbiotech: ["Prépa biologie", "Biotechnologies", "Bio-informatique", "Cosmétique", "Agroalimentaire"],
  isg: ["Programme Grande École", "Bachelor", "Marketing", "Finance", "Luxe"],
  ipsa: ["Prépa aéro", "Aéronautique", "Spatial", "Systèmes embarqués"],
};

export interface DevPrompt {
  /** A prompt of the catalogue (`seeds/catalog-prompts.ts`). */
  readonly slug: string;
  readonly answers: readonly string[];
}

/** Answers written for some prompts of the catalogue. */
export const DEV_PROMPTS: readonly DevPrompt[] = [
  {
    slug: "campus-spot",
    answers: [
      "La terrasse au soleil entre deux cours, café à la main.",
      "Au fond de la bibliothèque, casque sur les oreilles.",
      "Devant la machine à café qui marche une fois sur deux.",
      "Le local de l'asso, évidemment.",
      "Sur les marches de l'entrée, à refaire le monde.",
      "Partout sauf en amphi à 8 h.",
    ],
  },
  {
    slug: "worst-bug",
    answers: [
      "Un point-virgule manquant. Trois heures. Je ne veux pas en parler.",
      "J'ai fait mousser une culture bactérienne. Elle ne devait pas mousser.",
      "Un rm -rf au mauvais endroit, la veille du rendu.",
      "Le tableur qui a tout recalculé en dollars sans prévenir.",
      "Une soudure à l'envers sur la carte, fumée blanche incluse.",
      "J'ai présenté le mauvais fichier PowerPoint. Avec assurance.",
    ],
  },
  {
    slug: "could-teach",
    answers: [
      "Les pointeurs en C. Oui, vraiment.",
      "La mécanique des fluides, et je le vis bien.",
      "Le marketing de soi-même, la preuve ici.",
      "La biologie cellulaire, mitochondries comprises.",
      "La thermodynamique, et je fais des schémas.",
      "L'art de procrastiner avec méthode.",
    ],
  },
  {
    slug: "group-project-role",
    answers: [
      "…trouve le nom du projet avant la première ligne de code.",
      "…défend Comic Sans en soutenance. Et qui perd.",
      "…a soudain un empêchement quand il faut présenter.",
      "…relance le débat tabs contre espaces à 2 h du matin.",
      "…propose trois logos alors que personne n'en a demandé.",
    ],
  },
  {
    slug: "lyon-sunday",
    answers: [
      "Marché du quai Saint-Antoine, puis sieste au parc de la Tête d'Or.",
      "Monter à Fourvière à pied, redescendre en funiculaire, sans honte.",
      "Vélo le long du Rhône jusqu'à Gerland.",
      "Brunch, librairie, ciné. Dans cet ordre.",
      "Pique-nique aux Berges, avec des gens que j'aime.",
      "Rien. Absolument rien. Avec talent.",
    ],
  },
  {
    slug: "convince-you",
    answers: [
      "Les céréales se mangent avant le lait. Physique élémentaire.",
      "Le mode sombre sauve des vies (au moins les tiennes, à 2 h).",
      "La pizza froide le lendemain est meilleure. Fin du débat.",
      "Les plantes vertes rendent plus intelligent. Regarde mon bureau.",
      "Il faut toujours prendre le dessert.",
    ],
  },
  {
    slug: "green-flag",
    answers: [
      "Je réponds aux messages. Même tard, mais je réponds.",
      "Je me souviens de ce que tu m'as raconté la semaine dernière.",
      "Je partage mes frites.",
      "Je dis quand je ne sais pas.",
      "J'arrive à l'heure. Souvent en avance, même.",
      "Je ramène toujours des gâteaux en partiel.",
    ],
  },
  {
    slug: "bde-memory",
    answers: [
      "Le karaoké improvisé dans le bus du retour.",
      "Une bataille de confettis qui a duré deux heures.",
      "Avoir gagné le blind test sur les génériques de dessins animés.",
      "Le lever de soleil après le gala, sur les quais.",
      "On a appris une choré entière en une soirée.",
    ],
  },
];

/** Interests of the catalogue (`seeds/catalog-interests.ts`) the fictional members pick from. */
export const DEV_INTERESTS: readonly string[] = [
  "climbing",
  "running",
  "football",
  "volleyball",
  "yoga",
  "parkour",
  "cooking",
  "coffee",
  "thrifting",
  "photography",
  "cinema",
  "concerts",
  "reading",
  "anime",
  "board-games",
  "video-games",
  "escape-games",
  "hackathons",
  "electronics",
  "space",
  "plants",
  "hiking",
  "cycling",
  "dance",
  "volunteering",
];

/** Opening lines, often echoing the like that started the match. */
export const OPENERS: readonly string[] = [
  "Salut ! Ta réponse sur le café m'a fait rire 😄",
  "Hello ! On a apparemment le même avis sur l'ananas…",
  "Coucou, alors comme ça tu révises la nuit d'avant ?",
  "Salut ! Il faut absolument que tu me racontes ce bug.",
  "Hey ! Team mode sombre aussi, ça commence bien.",
  "Bonjour bonjour 👋 Fourvière à pied, sérieusement ?",
  "Salut ! Tu as l'air d'avoir de bons plans pour le dimanche.",
];

/** Back-and-forth exchanges used to grow conversations. */
export const EXCHANGES: readonly (readonly [string, string])[] = [
  ["Ahah merci ! Et toi, ta journée ?", "Partiel ce matin, donc je survis. Et toi ?"],
  ["Tu es en quelle année ?", "Troisième année, et toi ?"],
  ["Tu connais le café en bas du campus ?", "Celui avec les cookies énormes ? Évidemment."],
  ["On devrait tester ce brunch dont tout le monde parle.", "Je suis partant·e, ce week-end ?"],
  ["Tu fais quoi ce soir ?", "Projet de groupe… enfin, projet solo en vrai 😅"],
  ["J'ai vu que tu faisais de l'escalade !", "Oui ! Tu veux venir essayer un jour ?"],
  ["Ton prompt sur le TP m'a achevé.", "C'était un vrai traumatisme collectif."],
  ["Plutôt film ou série ce soir ?", "Série, mais je ne finis jamais rien."],
  ["Tu vas à la soirée BDE jeudi ?", "Je pense oui ! On s'y croise ?"],
  ["Tu as des recos de musique ?", "Je t'envoie ma playlist du moment."],
  ["Il fait beau, ça donne envie des quais.", "Carrément, après les cours ?"],
  ["Tu es du matin ou du soir ?", "Du soir, clairement. Le matin, je n'existe pas."],
];

export const CLOSERS: readonly string[] = [
  "Ça marche, à jeudi alors !",
  "Top, j'ai hâte 😊",
  "Bonne soirée !",
  "Je te dis ça demain.",
  "Ahah d'accord, deal.",
];

export const LIKE_COMMENTS: readonly string[] = [
  "Ta réponse m'a fait rire.",
  "Il faut que tu m'expliques ça.",
  "Même avis, à 100 %.",
  "Le meilleur prompt que j'ai lu aujourd'hui.",
  "J'adore cette photo !",
  "Je valide ce plan.",
];
