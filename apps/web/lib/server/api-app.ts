import "server-only";
import { anonymous, createApp, devHeaderResolver, type ViewerResolver } from "@epilove/api";
import { createDatabase, type Database, databaseUrlFromEnv } from "@epilove/db";

let database: Database | undefined;

/** One connection pool per server process, opened on first use. */
function getDatabase(): Database {
  database ??= createDatabase(databaseUrlFromEnv()).db;
  return database;
}

/**
 * How requests are authenticated. Until the Better Auth session resolver lands
 * (session A), only the development header resolver exists, behind DEV_AUTH=1
 * and APP_ENV=development or test.
 */
function viewerResolver(): ViewerResolver {
  if (process.env.DEV_AUTH === "1") {
    return devHeaderResolver();
  }
  return anonymous;
}

export const apiApp = createApp({
  version: process.env.APP_VERSION ?? "dev",
  database: getDatabase,
  resolveViewer: viewerResolver(),
});
