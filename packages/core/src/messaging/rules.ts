/**
 * Messaging rules (CHAT-02) and the first, synchronous moderation tier
 * (docs/07-confiance-securite.md, A6, tier 1: rules and lists). Tier 1 never
 * blocks a message on its own: it flags it so that later tiers (local
 * classifier, human review) can prioritise, and so that the "are you sure?"
 * prompt (SAF-09) can kick in.
 */
export const MESSAGING_RULES = {
  maxLength: 2000,
  /** Anti-spam: messages per minute and per member (docs/01, quotas). */
  perMinute: 20,
  /** A message can be deleted for everyone during this window (CHAT-08). */
  deleteWindowMinutes: 10,
  reactions: ["❤️", "😂", "😮", "😢", "👍", "🔥"] as const,
} as const;

export type Reaction = (typeof MESSAGING_RULES.reactions)[number];

export const isReaction = (value: string): value is Reaction =>
  (MESSAGING_RULES.reactions as readonly string[]).includes(value);

export type ModerationFlag = "link" | "contact_handle" | "insult" | "shouting" | "repetition";

const INSULTS = [
  "connard",
  "connasse",
  "salope",
  "pute",
  "encul",
  "pd",
  "tapette",
  "gouine",
  "bougnoul",
  "négro",
  "negro",
  "bitch",
  "whore",
  "slut",
  "fuck you",
  "nique ta",
  "ta gueule",
  "retard",
];

const normalize = (text: string) =>
  text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[0@]/g, "o")
    .replace(/[1!|]/g, "i")
    .replace(/3/g, "e")
    .replace(/4/g, "a")
    .replace(/\$/g, "s");

/** Normalises a message body: trims, collapses blank lines, refuses invisible-only text. */
export function cleanMessage(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/[​-‍﻿]/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function screenMessage(text: string): ModerationFlag[] {
  const flags: ModerationFlag[] = [];
  const lower = normalize(text);
  if (/(https?:\/\/|www\.|\b[a-z0-9-]+\.(com|fr|io|me|gg|ly|link)\b)/i.test(text)) {
    flags.push("link");
  }
  if (
    /\b(snap|insta|instagram|telegram|whatsapp|onlyfans)\b/i.test(text) ||
    /(\+33|\b0[67])[\s.-]?\d{2}/.test(text)
  ) {
    flags.push("contact_handle");
  }
  if (INSULTS.some((word) => new RegExp(`(^|[^a-z])${word}`).test(lower))) {
    flags.push("insult");
  }
  const letters = text.replace(/[^A-Za-zÀ-ÿ]/g, "");
  if (letters.length >= 12 && letters === letters.toUpperCase()) {
    flags.push("shouting");
  }
  if (/(.)\1{9,}/u.test(text)) {
    flags.push("repetition");
  }
  return flags;
}
