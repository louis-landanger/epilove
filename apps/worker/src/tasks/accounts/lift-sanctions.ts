import { listLapsedSanctions, reinstate } from "@atomes/db/repositories/admin";
import { writeAudit } from "@atomes/db/repositories/safety";
import type { Task } from "graphile-worker";
import type { AccountsDependencies } from "./purge";

/** Ends restrictions and suspensions whose duration is over (docs/07, section A4). */
export function liftSanctionsTask({ database, now = () => new Date() }: AccountsDependencies): Task {
  return async (_payload, helpers) => {
    const db = database();
    const lapsed = await listLapsedSanctions(db, now());
    for (const { userId } of lapsed) {
      await reinstate(db, userId);
      await writeAudit(db, {
        actorId: null,
        action: "sanction.lapsed",
        targetType: "user",
        targetId: userId,
      });
    }
    if (lapsed.length > 0) {
      helpers.logger.info(`reinstated ${lapsed.length} accounts`);
    }
  };
}
