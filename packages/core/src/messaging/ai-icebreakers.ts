import { screenMessage } from "./rules";

/**
 * AI conversation starters (CHAT-04): optional, off by default, only for
 * members who consented. Only pseudonymised excerpts leave the app: prompt
 * answers and catalogue interests, never a first name, a photo, an age, a
 * school, a gender or an orientation. The other member's answers are sent
 * only if they consented too. Suggestions are never sent on anyone's behalf:
 * the member picks one, edits it in the composer, and sends it themselves.
 */
export const AI_ICEBREAKER_RULES = {
  suggestions: 3,
  suggestionMaxLength: 160,
  promptsPerMember: 3,
  answerMaxLength: 240,
  interestsPerMember: 8,
  /** Requests per member over a rolling day. */
  dailyLimit: 5,
  /** Version of the consent text shown before the first use (`consent.version`). */
  consentVersion: "2026-10-icebreakers",
} as const;

export interface AiIcebreakerProfile {
  readonly prompts: readonly { readonly question: string; readonly answer: string }[];
  readonly interests: readonly string[];
}

const fold = (text: string) => text.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/** First-name parts worth hiding ("Jean-Baptiste" → jean, baptiste). */
const nameParts = (names: readonly string[]) =>
  new Set(names.flatMap((name) => fold(name).split(/[^\p{L}]+/u)).filter((part) => part.length >= 2));

/**
 * Removes what could identify someone in a free-text answer: e-mail
 * addresses, links, handles, phone numbers and long digit runs, and the
 * first names given (accents and case ignored).
 */
export function pseudonymize(text: string, names: readonly string[]): string {
  const parts = nameParts(names);
  return text
    .replace(/[\p{L}\p{N}._%+-]+@[\p{L}\p{N}.-]+\.\p{L}{2,}/gu, "[contact]")
    .replace(/\b(https?:\/\/|www\.)\S+/gi, "[lien]")
    .replace(/(^|\s)@[\p{L}\p{N}._]{2,}/gu, "$1[contact]")
    .replace(/\+?\d[\d\s.-]{6,}\d/g, "[contact]")
    .replace(/\p{L}+/gu, (word) => (parts.has(fold(word)) ? "[prénom]" : word))
    .replace(/\s+/g, " ")
    .trim();
}

const truncate = (text: string, max: number) => (text.length <= max ? text : `${text.slice(0, max - 1)}…`);

/** The excerpt of one profile sent to the model, already pseudonymised and capped. */
export function minimizeProfile(profile: AiIcebreakerProfile, names: readonly string[]): AiIcebreakerProfile {
  return {
    prompts: profile.prompts
      .filter((p) => p.answer.trim().length > 0)
      .slice(0, AI_ICEBREAKER_RULES.promptsPerMember)
      .map((p) => ({
        question: p.question,
        answer: truncate(pseudonymize(p.answer, names), AI_ICEBREAKER_RULES.answerMaxLength),
      })),
    interests: profile.interests.slice(0, AI_ICEBREAKER_RULES.interestsPerMember),
  };
}

/**
 * Keeps the suggestions fit to show: short, distinct, without a placeholder
 * or a first name, and clean for the message filter (no link, no contact,
 * no insult, no shouting).
 */
export function acceptSuggestions(raw: readonly string[], names: readonly string[]): string[] {
  const parts = nameParts(names);
  const seen = new Set<string>();
  const kept: string[] = [];
  for (const candidate of raw) {
    const text = candidate.replace(/\s+/g, " ").trim();
    const key = fold(text);
    if (
      text.length === 0 ||
      text.length > AI_ICEBREAKER_RULES.suggestionMaxLength ||
      seen.has(key) ||
      /\[[^\]]*\]/.test(text) ||
      (text.match(/\p{L}+/gu) ?? []).some((word) => parts.has(fold(word))) ||
      screenMessage(text).length > 0
    ) {
      continue;
    }
    seen.add(key);
    kept.push(text);
  }
  return kept.slice(0, AI_ICEBREAKER_RULES.suggestions);
}
