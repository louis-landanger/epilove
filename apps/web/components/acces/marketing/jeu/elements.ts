import { MATCHES, type Mode, PEOPLE, type PersonKey } from "../match/people";

/**
 * The hero's chemistry test (docs/02-design.md, section 5): three questions,
 * four answers each. The texts are in the messages (`home.game`); the
 * answers never leave the visitor's browser.
 */
export const QUESTIONS = {
  spot: ["quais", "croixRousse", "bu", "guill"],
  flag: ["vocal", "spoiler", "late", "startup"],
  seek: ["love", "friends", "teammate", "open"],
} as const;

export type QuestionKey = keyof typeof QUESTIONS;
export const QUESTION_ORDER: readonly QuestionKey[] = ["spot", "flag", "seek"];

/** One answer per question, by index, in `QUESTION_ORDER`. */
export type Answers = readonly [number, number, number];

/**
 * The visitor's element, one per spot and red flag: its symbol, and its key
 * in the messages (`home.game.elements.<key>`: name and line).
 */
const ELEMENTS = [
  // Les quais du Rhône
  ["vocaline", "Vo"],
  ["spoilium", "Sp"],
  ["crepusculium", "Cp"],
  ["pitchene", "Pi"],
  // Un bar à la Croix-Rousse
  ["traboulium", "Tb"],
  ["aperium", "Ap"],
  ["retardine", "Rt"],
  ["networkium", "Nw"],
  // La BU à 23 h
  ["chuchotine", "Ch"],
  ["revisium", "Rv"],
  ["noctambulium", "Nc"],
  ["businessplanium", "Bp"],
  // Un kebab à la Guill'
  ["kebabium", "Kb"],
  ["samouraine", "Sm"],
  ["minuitium", "Mn"],
  ["dronium", "Dr"],
] as const;

export type ElementKey = (typeof ELEMENTS)[number][0];

export interface AtomElement {
  readonly key: ElementKey;
  readonly symbol: string;
  /** Atomic number, as on a periodic table: always the same for the same answers. */
  readonly number: number;
}

export interface AtomMatch {
  readonly person: PersonKey;
  /** Chemistry, in percent. */
  readonly score: number;
  readonly mode: Mode;
}

/** A small, stable mix of the answers: the same answers always give the same element and match. */
function mix(answers: Answers): number {
  const [spot, flag, seek] = answers;
  let hash = 2166136261;
  for (const value of [spot, flag, seek]) {
    hash ^= value + 1;
    hash = Math.imul(hash, 16777619);
  }
  // Avalanche (MurmurHash3's finaliser): close answers land far apart.
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x85ebca6b);
  hash ^= hash >>> 13;
  hash = Math.imul(hash, 0xc2b2ae35);
  hash ^= hash >>> 16;
  return hash >>> 0;
}

export function isComplete(answers: readonly number[]): answers is Answers {
  return (
    answers.length === QUESTION_ORDER.length &&
    answers.every((answer, index) => {
      const key = QUESTION_ORDER[index];
      return key !== undefined && Number.isInteger(answer) && answer >= 0 && answer < QUESTIONS[key].length;
    })
  );
}

/** The visitor's element: their spot and red flag pick it, all three answers its number. */
export function elementFor(answers: Answers): AtomElement {
  const [spot, flag] = answers;
  const [key, symbol] = ELEMENTS[spot * QUESTIONS.flag.length + flag] ?? ELEMENTS[0];
  return { key, symbol, number: 1 + (mix(answers) % 118) };
}

/**
 * The fictional student the visitor bonds with: someone looking for the same
 * thing (love, or friendship for a friend or a teammate; anyone for "we'll
 * see"), and a chemistry score between 82 and 97 %.
 */
export function matchFor(answers: Answers): AtomMatch {
  const seek = QUESTIONS.seek[answers[2]] ?? "open";
  const people = Object.keys(PEOPLE) as PersonKey[];
  const wanted: Mode | null = seek === "love" ? "love" : seek === "open" ? null : "friends";
  const candidates = wanted ? people.filter((person) => PEOPLE[person].mode === wanted) : people;
  const hash = mix(answers);
  const person = candidates[hash % candidates.length] ?? MATCHES[0].people[0];
  return { person, score: 82 + ((hash >>> 8) % 16), mode: PEOPLE[person].mode };
}
