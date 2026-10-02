import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { runMigrations as runJobQueueMigrations } from "graphile-worker";
import type { Database } from "./client";

export const migrationsFolder = fileURLToPath(new URL("../drizzle", import.meta.url));

export async function runMigrations(db: Database) {
  await migrate(db, { migrationsFolder });
}

/**
 * Creates or upgrades the `graphile_worker` schema, so the API can enqueue
 * jobs (`enqueueJob`) before the worker has ever started.
 */
export async function runJobQueueSchemaMigrations(connectionString: string) {
  await runJobQueueMigrations({ connectionString });
}
