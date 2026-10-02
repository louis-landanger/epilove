import { createDatabase, databaseUrlFromEnv } from "./client";
import { runMigrations } from "./migrations";

const { db, close } = createDatabase(databaseUrlFromEnv(), { maxConnections: 1 });
try {
  await runMigrations(db);
  console.log("Migrations applied.");
} finally {
  await close();
}
