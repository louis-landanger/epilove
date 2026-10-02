import type { TaskList } from "graphile-worker";

/**
 * Every job the worker knows how to run. Jobs are added from the API inside
 * the same transaction as the business write (docs/04-architecture.md).
 */
export const taskList: TaskList = {
  // Placeholder scheduled task proving that the crontab runs. Replaced by the
  // retention purge and the nightly Drop in later phases.
  heartbeat: async (_payload, helpers) => {
    helpers.logger.info("heartbeat");
  },
};

/** Graphile Worker crontab format: minute hour day month weekday task. */
export const crontab = ["*/15 * * * * heartbeat"].join("\n");
