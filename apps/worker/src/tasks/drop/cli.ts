import { parseArgs } from "node:util";
import { dropDayAt, LYON_CAMPUS } from "@atomes/core";
import { createDatabase, databaseUrlFromEnv } from "@atomes/db";
import { publishDrops } from "@atomes/db/repositories/discovery-drop";
import { computeDrops } from "./compute";

/**
 * `pnpm drop:run [--day YYYY-MM-DD] [--no-publish]` (development only):
 * computes a Drop now, whatever the time, and publishes it.
 */
const { values } = parseArgs({
  options: {
    day: { type: "string" },
    publish: { type: "boolean", default: true },
  },
  allowNegative: true,
});

if (process.env.APP_ENV !== "development" && process.env.APP_ENV !== "test") {
  throw new Error("pnpm drop:run requires APP_ENV=development or APP_ENV=test.");
}
const now = new Date();
// By default, the Drop on screen right now (yesterday's until 21:00).
const day = values.day ?? dropDayAt(now, LYON_CAMPUS.timeZone);
const { db, close } = createDatabase(databaseUrlFromEnv(), { maxConnections: 4 });
try {
  const stats = await computeDrops(db, { day, now, force: true });
  console.log(JSON.stringify({ day, ...stats }, null, 2));
  if (values.publish) {
    console.log(`Published to ${await publishDrops(db, day, now)} members.`);
  }
} finally {
  await close();
}
