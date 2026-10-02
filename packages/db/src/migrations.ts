import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import type { Database } from "./client";

export const migrationsFolder = fileURLToPath(new URL("../drizzle", import.meta.url));

export async function runMigrations(db: Database) {
  await migrate(db, { migrationsFolder });
}
