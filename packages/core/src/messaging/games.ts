/**
 * Mini-games played by two in a conversation (CHAT-11): « Tu préfères »,
 * « Quiz nerd » and « Deux vérités, un mensonge ». Answers stay hidden from
 * the other member until both have played, so nobody copies anybody.
 */
export const GAMES = ["would_you_rather", "nerd_quiz", "two_truths"] as const;
export type Game = (typeof GAMES)[number];

export const GAME_RULES = {
  statementMaxLength: 120,
  statements: 3,
} as const;

export interface GamePrompt {
  readonly id: string;
  readonly textFr: string;
  readonly textEn: string;
  readonly options: readonly { readonly id: string; readonly fr: string; readonly en: string }[];
}

const pair = (id: string, aFr: string, aEn: string, bFr: string, bEn: string): GamePrompt => ({
  id,
  textFr: "Tu préfères…",
  textEn: "Would you rather…",
  options: [
    { id: "a", fr: aFr, en: aEn },
    { id: "b", fr: bFr, en: bEn },
  ],
});

/** Light dilemmas only: nothing intimate, nothing that would sort people. */
export const WOULD_YOU_RATHER: readonly GamePrompt[] = [
  pair("teleport", "Te téléporter", "Teleport", "Voler", "Fly"),
  pair("past-future", "Voir le passé", "See the past", "Voir le futur", "See the future"),
  pair(
    "mountain-sea",
    "Un week-end à la montagne",
    "A weekend in the mountains",
    "Un week-end à la mer",
    "A weekend by the sea",
  ),
  pair(
    "cook-clean",
    "Toujours cuisiner",
    "Always cook",
    "Toujours faire la vaisselle",
    "Always do the dishes",
  ),
  pair("book-film", "Lire le livre", "Read the book", "Voir le film", "Watch the film"),
  pair("early-late", "Partiel à 8 h", "An exam at 8 a.m.", "Partiel à 18 h", "An exam at 6 p.m."),
  pair("cat-dog", "Un chat", "A cat", "Un chien", "A dog"),
  pair(
    "concert-festival",
    "Un concert en salle",
    "An indoor gig",
    "Un festival en plein air",
    "An open-air festival",
  ),
  pair("pizza-sushi", "Pizza à vie", "Pizza for life", "Sushis à vie", "Sushi for life"),
  pair(
    "silence-noise",
    "Réviser dans le silence total",
    "Revise in total silence",
    "Réviser dans un café bruyant",
    "Revise in a noisy café",
  ),
  pair(
    "rewind-pause",
    "Pouvoir rembobiner 10 secondes",
    "Rewind 10 seconds",
    "Pouvoir mettre pause",
    "Pause time",
  ),
  pair(
    "speak-play",
    "Parler toutes les langues",
    "Speak every language",
    "Jouer de tous les instruments",
    "Play every instrument",
  ),
];

const quiz = (
  id: string,
  textFr: string,
  textEn: string,
  options: [string, string, string][],
): GamePrompt => ({
  id,
  textFr,
  textEn,
  options: options.map(([optionId, fr, en]) => ({ id: optionId, fr, en })),
});

/** Nerd culture: tastes, not knowledge (no wrong answer). */
export const NERD_QUIZ: readonly GamePrompt[] = [
  quiz("editor", "Ton éditeur de code ?", "Your code editor?", [
    ["vim", "Vim", "Vim"],
    ["vscode", "VS Code", "VS Code"],
    ["jetbrains", "Un IDE JetBrains", "A JetBrains IDE"],
    ["paper", "Une feuille et un stylo", "Pen and paper"],
  ]),
  quiz("saga", "La saga ultime ?", "The ultimate saga?", [
    ["starwars", "Star Wars", "Star Wars"],
    ["lotr", "Le Seigneur des anneaux", "The Lord of the Rings"],
    ["potter", "Harry Potter", "Harry Potter"],
    ["dune", "Dune", "Dune"],
  ]),
  quiz("tabs", "Tabulations ou espaces ?", "Tabs or spaces?", [
    ["tabs", "Tabulations", "Tabs"],
    ["spaces", "Espaces", "Spaces"],
    ["formatter", "Le formateur décide", "The formatter decides"],
  ]),
  quiz("console", "Ta première console ?", "Your first console?", [
    ["nintendo", "Une Nintendo", "A Nintendo"],
    ["playstation", "Une PlayStation", "A PlayStation"],
    ["pc", "Le PC familial", "The family PC"],
    ["none", "Aucune", "None"],
  ]),
  quiz("theme", "Thème clair ou sombre ?", "Light or dark theme?", [
    ["dark", "Sombre, évidemment", "Dark, obviously"],
    ["light", "Clair", "Light"],
    ["auto", "Selon l'heure", "Depends on the time"],
  ]),
  quiz("element", "Ton élément du tableau périodique ?", "Your element of the periodic table?", [
    ["carbon", "Le carbone", "Carbon"],
    ["helium", "L'hélium", "Helium"],
    ["gold", "L'or", "Gold"],
    ["neon", "Le néon", "Neon"],
  ]),
  quiz("superpower", "Le meilleur super-pouvoir de geek ?", "The best geek superpower?", [
    ["nobug", "Code sans bug", "Bug-free code"],
    ["sleep", "Ne plus jamais dormir", "Never needing sleep"],
    ["wifi", "Du wifi partout", "Wi-Fi everywhere"],
  ]),
  quiz("game", "Jeu de société préféré ?", "Favourite board game?", [
    ["catan", "Catan", "Catan"],
    ["chess", "Les échecs", "Chess"],
    ["codenames", "Codenames", "Codenames"],
    ["uno", "Uno (sans pitié)", "Uno (no mercy)"],
  ]),
];

export interface GameState {
  readonly game: Game;
  /** Prompt of the banks; null for « Deux vérités, un mensonge ». */
  readonly promptId: string | null;
  /** Who started the game. */
  readonly authorId: string;
  /** « Deux vérités, un mensonge »: the three statements and the lie's index. */
  readonly statements?: readonly string[];
  readonly lie?: number;
  /** Choice of each player, by member id (option id, or a statement's index). */
  readonly answers: Readonly<Record<string, string>>;
}

export function promptOf(state: GameState): GamePrompt | null {
  const bank =
    state.game === "would_you_rather" ? WOULD_YOU_RATHER : state.game === "nerd_quiz" ? NERD_QUIZ : [];
  return bank.find((p) => p.id === state.promptId) ?? null;
}

/** The choices of a game, as option ids. */
export function choicesOf(state: GameState): string[] {
  if (state.game === "two_truths") {
    return (state.statements ?? []).map((_, index) => String(index));
  }
  return promptOf(state)?.options.map((o) => o.id) ?? [];
}

/** A prompt of the bank not played yet in this conversation, when possible. */
export function pickPrompt(
  game: "would_you_rather" | "nerd_quiz",
  played: ReadonlySet<string>,
  random: () => number,
): GamePrompt {
  const bank = game === "would_you_rather" ? WOULD_YOU_RATHER : NERD_QUIZ;
  const fresh = bank.filter((p) => !played.has(p.id));
  const pool = fresh.length > 0 ? fresh : bank;
  return pool[Math.floor(random() * pool.length)] ?? (bank[0] as GamePrompt);
}

export type PlayCheck =
  | { ok: true }
  | { ok: false; reason: "invalid_choice" | "already_played" | "own_game" };

export function checkPlay(state: GameState, playerId: string, choice: string): PlayCheck {
  if (!choicesOf(state).includes(choice)) {
    return { ok: false, reason: "invalid_choice" };
  }
  if (state.game === "two_truths" && playerId === state.authorId) {
    return { ok: false, reason: "own_game" };
  }
  if (state.answers[playerId] !== undefined) {
    return { ok: false, reason: "already_played" };
  }
  return { ok: true };
}

export interface GameView {
  /** The viewer's choice (a guess, in « Deux vérités, un mensonge »). */
  readonly mine: string | null;
  /** The other's choice, shown once the viewer played too (or to the author, once guessed). */
  readonly theirs: string | null;
  readonly otherPlayed: boolean;
  readonly done: boolean;
  /** The viewer wrote the statements and only waits for the guess. */
  readonly author: boolean;
  /** The lie, shown to its author, and to the other member once they guessed. */
  readonly lie: string | null;
}

/** What one member may see of a game: nothing of the other's answer before playing. */
export function gameView(state: GameState, viewerId: string): GameView {
  const mine = state.answers[viewerId] ?? null;
  const other = Object.entries(state.answers).find(([id]) => id !== viewerId)?.[1] ?? null;
  if (state.game === "two_truths") {
    const author = state.authorId === viewerId;
    const guess = author ? other : mine;
    const lie = state.lie === undefined ? null : String(state.lie);
    return {
      mine: author ? null : mine,
      theirs: author ? other : null,
      otherPlayed: author ? other !== null : true,
      done: guess !== null,
      author,
      lie: author || guess !== null ? lie : null,
    };
  }
  return {
    mine,
    theirs: mine !== null ? other : null,
    otherPlayed: other !== null,
    done: mine !== null && other !== null,
    author: false,
    lie: null,
  };
}
