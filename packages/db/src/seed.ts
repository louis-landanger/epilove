import { createDatabase, databaseUrlFromEnv } from "./client";
import { seedReferenceData } from "./seed-data";

const { db, close } = createDatabase(databaseUrlFromEnv(), { maxConnections: 1 });
try {
  await seedReferenceData(db);
  console.log("Reference data seeded (Lyon campus and schools).");
} finally {
  await close();
}
