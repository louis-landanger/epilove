import { resumeScheduledPauses } from "@atomes/db/repositories/accounts";
import type { Task } from "graphile-worker";
import type { AccountsDependencies } from "./purge";

/** Ends scheduled pauses (SAF-08, "mode partiels"): members come back without doing anything. */
export function resumePausedTask({ database, now = () => new Date() }: AccountsDependencies): Task {
  return async (_payload, helpers) => {
    const resumed = await resumeScheduledPauses(database(), now());
    if (resumed > 0) {
      helpers.logger.info(`resumed ${resumed} scheduled pauses`);
    }
  };
}
