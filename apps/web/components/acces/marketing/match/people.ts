import type { SchoolSlug } from "@atomes/core";

/**
 * The fictional students of the hero (docs/02-design.md, section 5): never
 * real people, never a face. Their prompt and answer are in the messages
 * (`home.match.people`).
 */
export interface Person {
  readonly name: string;
  readonly age: number;
  /** Two letters, set on the card like an element's symbol. */
  readonly symbol: string;
  readonly school: SchoolSlug;
  readonly promo: number;
  readonly mode: Mode;
  /** Second colour of the picture's glow, next to the school's. */
  readonly accent: "plasma" | "volt" | "violet";
}

export type Mode = "love" | "friends";

export const PEOPLE = {
  lea: { name: "Léa", age: 20, symbol: "Lé", school: "isg", promo: 2027, mode: "love", accent: "plasma" },
  yanis: {
    name: "Yanis",
    age: 21,
    symbol: "Ya",
    school: "ipsa",
    promo: 2026,
    mode: "love",
    accent: "violet",
  },
  ines: {
    name: "Inès",
    age: 19,
    symbol: "In",
    school: "supbiotech",
    promo: 2028,
    mode: "friends",
    accent: "volt",
  },
  hugo: {
    name: "Hugo",
    age: 22,
    symbol: "Hu",
    school: "epita",
    promo: 2026,
    mode: "friends",
    accent: "plasma",
  },
  camille: {
    name: "Camille",
    age: 20,
    symbol: "Ca",
    school: "esme",
    promo: 2027,
    mode: "love",
    accent: "plasma",
  },
  zoe: { name: "Zoé", age: 20, symbol: "Zo", school: "ipsa", promo: 2027, mode: "love", accent: "plasma" },
  malik: {
    name: "Malik",
    age: 21,
    symbol: "Ma",
    school: "isg",
    promo: 2026,
    mode: "friends",
    accent: "violet",
  },
  sacha: {
    name: "Sacha",
    age: 21,
    symbol: "Sa",
    school: "epita",
    promo: 2027,
    mode: "friends",
    accent: "volt",
  },
} as const satisfies Record<string, Person>;

export type PersonKey = keyof typeof PEOPLE;

export interface Match {
  readonly people: readonly [PersonKey, PersonKey];
  /** Chemistry, in percent. */
  readonly score: number;
  readonly mode: Mode;
}

/** The matches the hero shows in turn: love and friendship, every combination. */
export const MATCHES: readonly [Match, ...Match[]] = [
  { people: ["lea", "yanis"], score: 92, mode: "love" },
  { people: ["ines", "hugo"], score: 88, mode: "friends" },
  { people: ["camille", "zoe"], score: 95, mode: "love" },
  { people: ["malik", "sacha"], score: 84, mode: "friends" },
];
