import { keyRingFromEnv } from "@epilove/crypto";
import { createDatabase, databaseUrlFromEnv } from "../client";
import { runDevSeed } from "./seed";
import { devStorageFromEnv } from "./storage";

// Fictional data only, and never outside a development or test database.
if (process.env.APP_ENV !== "development" && process.env.APP_ENV !== "test") {
  throw new Error("pnpm db:seed:dev requires APP_ENV=development or APP_ENV=test.");
}
const secret = process.env.EMAIL_HMAC_SECRET;
if (!secret) {
  throw new Error("EMAIL_HMAC_SECRET must be set.");
}

const started = Date.now();
const { db, close } = createDatabase(databaseUrlFromEnv(), { maxConnections: 4 });
try {
  const summary = await runDevSeed({
    db,
    keyRing: keyRingFromEnv(),
    emailHmacSecret: secret,
    storage: devStorageFromEnv(),
    log: (line) => console.log(line),
  });
  console.log(
    `Seeded ${summary.members} members, ${summary.photos} photos, ${summary.likes} likes, ` +
      `${summary.matches} matches and ${summary.messages} messages in ${Math.round((Date.now() - started) / 1000)} s.`,
  );
} finally {
  await close();
}
