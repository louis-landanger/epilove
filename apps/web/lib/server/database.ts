import "server-only";
import { createDatabase, type Database, databaseUrlFromEnv } from "@epilove/db";

let database: Database | undefined;

/** One connection pool per server process, opened on first use. */
export function getDatabase(): Database {
  database ??= createDatabase(databaseUrlFromEnv()).db;
  return database;
}
