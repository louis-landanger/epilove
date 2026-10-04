import { createDatabase } from "@atomes/db";
import { notifyDueCheckIns } from "@atomes/db/repositories/messaging-date-safety";
import type { Task } from "graphile-worker";

/**
 * Every five minutes: "Tout s'est bien passé ?" to members whose shared date
 * (IRL-03) started three hours ago. Once per date; the answer shows on the
 * trusted person's page.
 */
export const dateCheckIn: Task = async (_payload, helpers) => {
  const url = process.env.DATABASE_URL;
  if (!url) {
    return;
  }
  const { db, close } = createDatabase(url, { maxConnections: 1 });
  try {
    const sent = await notifyDueCheckIns(db, new Date());
    if (sent > 0) {
      helpers.logger.info(`date check-ins sent: ${sent}`);
    }
  } finally {
    await close();
  }
};
