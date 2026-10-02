import type { Database } from "../client";
import { seedReferenceData } from "./reference";

/**
 * Idempotent seeds run by `pnpm db:seed`, in order. One line per seed:
 * reference data first, then catalogues (prompts, interests, questions).
 * Development-only fake members live in a separate script (`db:seed:dev`).
 */
const seeds: ReadonlyArray<(db: Database) => Promise<void>> = [seedReferenceData];

export async function runSeeds(db: Database) {
  for (const seed of seeds) {
    await seed(db);
  }
}

export { seedReferenceData };
