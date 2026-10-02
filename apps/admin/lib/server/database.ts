import "server-only";
import { createDatabase, type Database, databaseUrlFromEnv } from "@epilove/db";

let database: Database | undefined;

export function getDatabase(): Database {
  database ??= createDatabase(databaseUrlFromEnv(), { maxConnections: 5 }).db;
  return database;
}
