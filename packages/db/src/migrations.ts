import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { runMigrations as runJobQueueMigrations } from "graphile-worker";
import type { Database } from "./client";

export const migrationsFolder = fileURLToPath(new URL("../drizzle", import.meta.url));

/** SQLSTATE codes of "already exists" errors (unique violation in the catalog, duplicate schema, table, object). */
const ALREADY_EXISTS = new Set(["23505", "42P06", "42P07", "42710"]);

function sqlState(error: unknown): string | undefined {
  for (let current = error; current instanceof Error; current = current.cause) {
    const code = (current as Error & { code?: unknown }).code;
    if (typeof code === "string") {
      return code;
    }
  }
  return undefined;
}

/**
 * Applies the pending migrations. Several runs can start at once on an empty
 * database (test files run in parallel): the losers fail on an object the
 * winner has just created, their transaction rolls back, and on the next
 * attempt they find the migrations applied.
 */
export async function runMigrations(db: Database) {
  for (let attempt = 1; ; attempt += 1) {
    try {
      await migrate(db, { migrationsFolder });
      return;
    } catch (error) {
      const code = sqlState(error);
      if (attempt >= 5 || code === undefined || !ALREADY_EXISTS.has(code)) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 100 * attempt));
    }
  }
}

/**
 * Creates or upgrades the `graphile_worker` schema, so the API can enqueue
 * jobs (`enqueueJob`) before the worker has ever started.
 */
export async function runJobQueueSchemaMigrations(connectionString: string) {
  await runJobQueueMigrations({ connectionString });
}
