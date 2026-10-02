/**
 * Profile content rules (PRO-01 to PRO-04), shared by the onboarding, the
 * profile editor, the API and the database constraints.
 */

export const MIN_PHOTOS = 2;
export const MAX_PHOTOS = 6;
export const PHOTO_ALT_TEXT_MAX_LENGTH = 150;

export const PROMPT_ANSWER_COUNT = 3;
export const PROMPT_ANSWER_MAX_LENGTH = 200;

export const MIN_INTERESTS = 3;
export const MAX_INTERESTS = 10;

export const FIRST_NAME_MAX_LENGTH = 40;
export const PRONOUNS_MAX_LENGTH = 30;
export const PROGRAM_MAX_LENGTH = 60;

export const INTENTIONS = ["relationship", "see_what_happens", "friendship"] as const;
export type Intention = (typeof INTENTIONS)[number];

export const LANGUAGES = [
  "fr",
  "en",
  "es",
  "de",
  "it",
  "pt",
  "ar",
  "zh",
  "ja",
  "ko",
  "ru",
  "tr",
  "vi",
  "hi",
] as const;
export type Language = (typeof LANGUAGES)[number];
export const MAX_LANGUAGES = 6;

// Letters from any script, combining marks, spaces, apostrophes and hyphens.
const FIRST_NAME_PATTERN = /^\p{L}[\p{L}\p{M}' -]*$/u;

/**
 * Cleans a first name: trims, collapses spaces, normalises apostrophes.
 * Returns `null` when it is empty, too long or contains digits, symbols or
 * links (a first name is not a place for an Instagram handle).
 */
export function normalizeFirstName(input: string): string | null {
  const value = input.normalize("NFC").replaceAll(/[‘’ʼ]/g, "'").replaceAll(/\s+/g, " ").trim();
  if (value.length === 0 || value.length > FIRST_NAME_MAX_LENGTH || !FIRST_NAME_PATTERN.test(value)) {
    return null;
  }
  return value;
}

/** Free-text pronouns ("elle", "iel", "he/him"…): short, no links. */
export function normalizePronouns(input: string): string | null {
  const value = input.replaceAll(/\s+/g, " ").trim();
  if (value.length === 0) {
    return null;
  }
  if (value.length > PRONOUNS_MAX_LENGTH || /[<>@:]|https?|www\./i.test(value)) {
    return null;
  }
  return value;
}

/** Prompt answers: trimmed, newlines limited to two in a row, 1 to 200 characters. */
export function normalizePromptAnswer(input: string): string | null {
  const value = input
    .replaceAll(/\r\n?/g, "\n")
    .replaceAll(/[ \t]+/g, " ")
    .replaceAll(/\n{3,}/g, "\n\n")
    .trim();
  if (value.length === 0 || value.length > PROMPT_ANSWER_MAX_LENGTH) {
    return null;
  }
  return value;
}
