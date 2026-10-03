import type { Database } from "../client";
import { seedInterests } from "./catalog-interests";
import { seedPrompts } from "./catalog-prompts";
import { seedQuestions } from "./questions";
import { seedReferenceData } from "./reference";
import { seedSpots } from "./spots";
import { seedWeeklyQuestions } from "./weekly-questions";

/**
 * Idempotent seeds run by `pnpm db:seed`, in order. One line per seed:
 * reference data first, then catalogues (prompts, interests, questions).
 * Development-only fake members live in a separate script (`db:seed:dev`).
 */
const seeds: ReadonlyArray<(db: Database) => Promise<void>> = [
  seedReferenceData,
  seedPrompts,
  seedInterests,
  seedQuestions,
  seedSpots,
  seedWeeklyQuestions,
];

export async function runSeeds(db: Database) {
  for (const seed of seeds) {
    await seed(db);
  }
}

export { INTERESTS } from "./catalog-interests";
export { PROMPTS } from "./catalog-prompts";
export { QUESTION_SECTIONS, QUESTIONS, type QuestionDefinition, type QuestionSection } from "./questions";
export { SPOTS } from "./spots";
export { WEEKLY_QUESTIONS } from "./weekly-questions";
export { seedInterests, seedPrompts, seedQuestions, seedReferenceData, seedSpots, seedWeeklyQuestions };
