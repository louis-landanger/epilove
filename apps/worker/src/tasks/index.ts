import type { TaskList } from "graphile-worker";
import { dropTickTask } from "./drop/tick";
import { chatNudgeTick } from "./messaging/nudge";
import { messagePurge } from "./messaging/purge";
import { outboxPurge } from "./outbox/purge";
import { pactReveal, pactRevealDue } from "./pact/reveal";

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
  chat_nudge: chatNudgeTick,
  drop_tick: dropTickTask,
  message_purge: messagePurge,
  outbox_purge: outboxPurge,
  pact_reveal: pactReveal,
  pact_reveal_due: pactRevealDue,
};

/** Graphile Worker crontab format: minute hour day month weekday task. */
export const crontab = [
  "*/15 * * * * heartbeat",
  "17 4 * * * outbox_purge",
  "* * * * * pact_reveal_due",
  "* * * * * drop_tick",
  "23 4 * * * message_purge",
  "7 * * * * chat_nudge",
].join("\n");
