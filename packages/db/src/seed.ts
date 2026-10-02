import { createDatabase, databaseUrlFromEnv } from "./client";
import { runSeeds } from "./seeds";

const { db, close } = createDatabase(databaseUrlFromEnv(), { maxConnections: 1 });
try {
  await runSeeds(db);
  console.log("Seeds applied.");
} finally {
  await close();
}
