import { createDatabase, databaseUrlFromEnv } from "./client";
import { runJobQueueSchemaMigrations, runMigrations } from "./migrations";

const url = databaseUrlFromEnv();
const { db, close } = createDatabase(url, { maxConnections: 1 });
try {
  await runMigrations(db);
  await runJobQueueSchemaMigrations(url);
  console.log("Migrations applied.");
} finally {
  await close();
}
