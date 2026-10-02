/**
 * Conversation starters drawn from both profiles (CHAT-03). Pure and
 * deterministic: the same pair gets the same suggestions. The texts live in
 * the web app's messages (`chat.icebreakers.*`), this only picks templates
 * and their parameters. No AI here (that is CHAT-04, optional and separate).
 */
export type Icebreaker =
  | { readonly key: "sharedInterest"; readonly params: { readonly interest: string } }
  | { readonly key: "theirPrompt"; readonly params: { readonly question: string } }
  | { readonly key: "sharedAnswer"; readonly params: { readonly question: string; readonly answer: string } }
  | { readonly key: "campus"; readonly params: { readonly index: number } };

export const CAMPUS_ICEBREAKERS = 8;

export interface IcebreakerInput {
  readonly sharedInterests: readonly string[];
  readonly theirPrompts: readonly string[];
  readonly sharedAnswers: readonly { readonly question: string; readonly answer: string }[];
  /** Stable seed for the pair (e.g. the match id). */
  readonly seed: string;
}

function hash(value: string): number {
  let h = 2166136261;
  for (let i = 0; i < value.length; i++) {
    h = Math.imul(h ^ value.charCodeAt(i), 16777619) >>> 0;
  }
  return h;
}

export function pickIcebreakers(input: IcebreakerInput, count = 3): Icebreaker[] {
  const h = hash(input.seed);
  const pick = <T>(items: readonly T[], offset: number): T | undefined =>
    items[(h + offset) % Math.max(1, items.length)];
  const picks: Icebreaker[] = [];

  const interest = pick(input.sharedInterests, 0);
  if (interest) {
    picks.push({ key: "sharedInterest", params: { interest } });
  }
  const prompt = pick(input.theirPrompts, 1);
  if (prompt) {
    picks.push({ key: "theirPrompt", params: { question: prompt } });
  }
  const answer = pick(input.sharedAnswers, 2);
  if (answer) {
    picks.push({ key: "sharedAnswer", params: answer });
  }
  let offset = 0;
  while (picks.length < count) {
    picks.push({ key: "campus", params: { index: (h + offset * 3) % CAMPUS_ICEBREAKERS } });
    offset++;
  }
  return picks.slice(0, count);
}
