import type { Database } from "../client";
import { seedInterests } from "./catalog-interests";
import { seedPrompts } from "./catalog-prompts";
import { seedReferenceData } from "./reference";

/**
 * Idempotent seeds run by `pnpm db:seed`, in order. One line per seed:
 * reference data first, then catalogues (prompts, interests, questions).
 * Development-only fake members live in a separate script (`db:seed:dev`).
 */
const seeds: ReadonlyArray<(db: Database) => Promise<void>> = [seedReferenceData, seedPrompts, seedInterests];

export async function runSeeds(db: Database) {
  for (const seed of seeds) {
    await seed(db);
  }
}

export { INTERESTS } from "./catalog-interests";
export { PROMPTS } from "./catalog-prompts";
export { seedInterests, seedPrompts, seedReferenceData };
