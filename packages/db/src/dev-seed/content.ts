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
  readonly slug: string;
  readonly textFr: string;
  readonly textEn: string;
  readonly category: string;
  readonly answers: readonly string[];
}

/** Prefixed `dev-` until the real prompt catalogue (session A) is merged. */
export const DEV_PROMPTS: readonly DevPrompt[] = [
  {
    slug: "dev-campus-spot",
    textFr: "Le spot du campus où on me trouve…",
    textEn: "The campus spot where you'll find me…",
    category: "campus",
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
    slug: "dev-worst-bug",
    textFr: "Mon pire bug / ma pire manip de TP…",
    textEn: "My worst bug / lab disaster…",
    category: "campus",
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
    slug: "dev-could-teach",
    textFr: "La matière que je pourrais enseigner les yeux fermés…",
    textEn: "The subject I could teach blindfolded…",
    category: "campus",
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
    slug: "dev-group-debate",
    textFr: "Mon plus gros débat de projet de groupe…",
    textEn: "My biggest group project debate…",
    category: "campus",
    answers: [
      "Le nom du projet. On y a passé plus de temps que sur le projet.",
      "Police Comic Sans : pour ou contre. J'étais pour. J'ai perdu.",
      "Qui présente ? Tout le monde a soudain eu un empêchement.",
      "Tabs contre espaces, la rupture a été consommée.",
      "Faut-il vraiment un logo ? Oui. Trois même.",
    ],
  },
  {
    slug: "dev-sunday-lyon",
    textFr: "Mon plan parfait pour un dimanche à Lyon…",
    textEn: "My perfect Sunday plan in Lyon…",
    category: "lyon",
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
    slug: "dev-convince",
    textFr: "Je te convaincs en un argument que…",
    textEn: "I'll convince you in one argument that…",
    category: "fun",
    answers: [
      "Les céréales se mangent avant le lait. Physique élémentaire.",
      "Le mode sombre sauve des vies (au moins les tiennes, à 2 h).",
      "La pizza froide le lendemain est meilleure. Fin du débat.",
      "Les plantes vertes rendent plus intelligent. Regarde mon bureau.",
      "Il faut toujours prendre le dessert.",
    ],
  },
  {
    slug: "dev-green-flag",
    textFr: "Mon green flag le plus sous-côté…",
    textEn: "My most underrated green flag…",
    category: "values",
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
    slug: "dev-bde-memory",
    textFr: "Le meilleur souvenir de soirée BDE que je peux raconter ici…",
    textEn: "The best student party memory I can share here…",
    category: "campus",
    answers: [
      "Le karaoké improvisé dans le bus du retour.",
      "Une bataille de confettis qui a duré deux heures.",
      "Avoir gagné le blind test sur les génériques de dessins animés.",
      "Le lever de soleil après le gala, sur les quais.",
      "On a appris une choré entière en une soirée.",
    ],
  },
];

export const DEV_INTERESTS: readonly { slug: string; labelFr: string; labelEn: string; category: string }[] =
  [
    { slug: "dev-climbing", labelFr: "Escalade", labelEn: "Climbing", category: "sport" },
    { slug: "dev-running", labelFr: "Course à pied", labelEn: "Running", category: "sport" },
    { slug: "dev-football", labelFr: "Foot", labelEn: "Football", category: "sport" },
    { slug: "dev-volley", labelFr: "Volley", labelEn: "Volleyball", category: "sport" },
    { slug: "dev-yoga", labelFr: "Yoga", labelEn: "Yoga", category: "sport" },
    { slug: "dev-cooking", labelFr: "Cuisine", labelEn: "Cooking", category: "lifestyle" },
    {
      slug: "dev-coffee",
      labelFr: "Cafés de spécialité",
      labelEn: "Specialty coffee",
      category: "lifestyle",
    },
    { slug: "dev-thrifting", labelFr: "Friperies", labelEn: "Thrifting", category: "lifestyle" },
    { slug: "dev-photo", labelFr: "Photo argentique", labelEn: "Film photography", category: "culture" },
    { slug: "dev-cinema", labelFr: "Cinéma", labelEn: "Cinema", category: "culture" },
    { slug: "dev-concerts", labelFr: "Concerts", labelEn: "Concerts", category: "culture" },
    { slug: "dev-reading", labelFr: "Lecture", labelEn: "Reading", category: "culture" },
    { slug: "dev-manga", labelFr: "Manga", labelEn: "Manga", category: "culture" },
    { slug: "dev-boardgames", labelFr: "Jeux de société", labelEn: "Board games", category: "games" },
    { slug: "dev-videogames", labelFr: "Jeux vidéo", labelEn: "Video games", category: "games" },
    { slug: "dev-chess", labelFr: "Échecs", labelEn: "Chess", category: "games" },
    { slug: "dev-hackathons", labelFr: "Hackathons", labelEn: "Hackathons", category: "tech" },
    { slug: "dev-3dprint", labelFr: "Impression 3D", labelEn: "3D printing", category: "tech" },
    { slug: "dev-space", labelFr: "Espace", labelEn: "Space", category: "science" },
    { slug: "dev-plants", labelFr: "Plantes vertes", labelEn: "House plants", category: "lifestyle" },
    { slug: "dev-hiking", labelFr: "Randonnée", labelEn: "Hiking", category: "outdoors" },
    { slug: "dev-cycling", labelFr: "Vélo", labelEn: "Cycling", category: "outdoors" },
    { slug: "dev-dance", labelFr: "Danse", labelEn: "Dance", category: "culture" },
    { slug: "dev-volunteering", labelFr: "Bénévolat", labelEn: "Volunteering", category: "community" },
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
