import type { Database } from "../client";
import { seedQuestions } from "./questions";
import { seedReferenceData } from "./reference";
import { seedSpots } from "./spots";

/**
 * Idempotent seeds run by `pnpm db:seed`, in order. One line per seed:
 * reference data first, then catalogues (prompts, interests, questions).
 * Development-only fake members live in a separate script (`db:seed:dev`).
 */
const seeds: ReadonlyArray<(db: Database) => Promise<void>> = [seedReferenceData, seedQuestions, seedSpots];

export async function runSeeds(db: Database) {
  for (const seed of seeds) {
    await seed(db);
  }
}

export { QUESTION_SECTIONS, QUESTIONS, type QuestionDefinition, type QuestionSection } from "./questions";
export { SPOTS } from "./spots";
export { seedQuestions, seedReferenceData, seedSpots };
