import { MIN_INTERESTS, PROMPT_ANSWER_COUNT } from "./rules";

/** What the completeness gauge looks at (PRO-05). Counts only, never content. */
export interface ProfileFacts {
  /** Photos processed and not rejected by moderation. */
  readonly photos: number;
  readonly photosWithAltText: number;
  readonly promptAnswers: number;
  readonly interests: number;
  readonly hasProgram: boolean;
  readonly languages: number;
  readonly hasAnthem: boolean;
  readonly photoVerified: boolean;
}

/** Actionable tips, most valuable first. Keys of the `profile.tips` i18n messages. */
export const COMPLETENESS_TIPS = [
  "add_photo",
  "add_prompt",
  "add_interests",
  "verify_photo",
  "add_program",
  "add_languages",
  "add_anthem",
  "add_alt_text",
] as const;
export type CompletenessTip = (typeof COMPLETENESS_TIPS)[number];

export interface Completeness {
  /** 0 to 100. */
  readonly score: number;
  readonly tips: readonly CompletenessTip[];
}

/** Photos beyond this number add nothing to the score (but remain welcome). */
const PHOTOS_FOR_FULL_SCORE = 4;

const WEIGHTS = {
  photos: 35,
  prompts: 25,
  interests: 15,
  verification: 5,
  program: 5,
  languages: 5,
  anthem: 5,
  altText: 5,
} as const;

/** Completeness score and the tips that would raise it the most. */
export function profileCompleteness(facts: ProfileFacts): Completeness {
  const ratio = (value: number, target: number) => Math.min(Math.max(value, 0), target) / target;
  const parts: Record<keyof typeof WEIGHTS, number> = {
    photos: ratio(facts.photos, PHOTOS_FOR_FULL_SCORE),
    prompts: ratio(facts.promptAnswers, PROMPT_ANSWER_COUNT),
    interests: ratio(facts.interests, MIN_INTERESTS),
    verification: facts.photoVerified ? 1 : 0,
    program: facts.hasProgram ? 1 : 0,
    languages: facts.languages > 0 ? 1 : 0,
    anthem: facts.hasAnthem ? 1 : 0,
    altText: facts.photos > 0 ? ratio(facts.photosWithAltText, facts.photos) : 0,
  };
  const score = Math.round(
    (Object.keys(WEIGHTS) as (keyof typeof WEIGHTS)[]).reduce(
      (sum, key) => sum + WEIGHTS[key] * parts[key],
      0,
    ),
  );

  const tips: CompletenessTip[] = [];
  if (parts.photos < 1) tips.push("add_photo");
  if (parts.prompts < 1) tips.push("add_prompt");
  if (parts.interests < 1) tips.push("add_interests");
  if (!facts.photoVerified) tips.push("verify_photo");
  if (!facts.hasProgram) tips.push("add_program");
  if (facts.languages === 0) tips.push("add_languages");
  if (!facts.hasAnthem) tips.push("add_anthem");
  if (facts.photos > 0 && parts.altText < 1) tips.push("add_alt_text");

  return { score, tips };
}
