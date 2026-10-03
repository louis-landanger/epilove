import type { TaskList } from "graphile-worker";
import { accountsCrontab, accountsTasks } from "./accounts";
import { dropTickTask } from "./drop/tick";
import { mediaCrontab, mediaTasks } from "./media";
import { dateCheckIn } from "./messaging/check-in";
import { chatNudgeTick } from "./messaging/nudge";
import { mediaPurge, messagePurge } from "./messaging/purge";
import { weeklyDigest } from "./notifications/digest";
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
  ...accountsTasks(),
  ...mediaTasks(),
  chat_nudge: chatNudgeTick,
  date_check_in: dateCheckIn,
  drop_tick: dropTickTask,
  media_purge: mediaPurge,
  message_purge: messagePurge,
  outbox_purge: outboxPurge,
  pact_reveal: pactReveal,
  pact_reveal_due: pactRevealDue,
  weekly_digest: weeklyDigest,
};

/** Graphile Worker crontab format: minute hour day month weekday task. */
export const crontab = [
  "*/15 * * * * heartbeat",
  ...accountsCrontab,
  ...mediaCrontab,
  "17 4 * * * outbox_purge",
  "* * * * * pact_reveal_due",
  "* * * * * drop_tick",
  "23 4 * * * message_purge",
  "7 * * * * chat_nudge",
  "*/5 * * * * media_purge",
  "*/5 * * * * date_check_in",
  "11 * * * 0 weekly_digest",
].join("\n");
