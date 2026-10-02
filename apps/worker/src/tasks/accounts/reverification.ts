import {
  listReverificationReminders,
  markReminded,
  pauseOverdueReverifications,
} from "@epilove/db/repositories/accounts";
import { createMailer, mailerConfigFromEnv, reverificationReminderEmail } from "@epilove/email";
import type { Task } from "graphile-worker";
import type { ExportDependencies } from "./export";

/** Reminders are sent at most this often during the window. */
const REMIND_EVERY_DAYS = 10;
const WINDOW_DAYS = 30;

/**
 * ONB-09, daily: reminds members whose re-verification window is open and
 * pauses those past the deadline (the next code sign-in lifts the pause).
 */
export function reverificationTask({
  database,
  now = () => new Date(),
  sendEmail,
  appUrl = process.env.APP_URL ?? "http://localhost:3000",
}: ExportDependencies): Task {
  return async (_payload, helpers) => {
    const db = database();
    const at = now();
    const day = 86_400_000;
    const reminders = await listReverificationReminders(
      db,
      at,
      new Date(at.getTime() + WINDOW_DAYS * day),
      new Date(at.getTime() - REMIND_EVERY_DAYS * day),
    );
    const send = sendEmail ?? ((to, message) => createMailer(mailerConfigFromEnv()).send(to, message));
    for (const member of reminders) {
      if (!member.reverifyDueAt) continue;
      await send(
        member.email,
        reverificationReminderEmail(member.reverifyDueAt, `${appUrl}/compte/verifier`, member.locale),
      ).catch(() => helpers.logger.warn("re-verification reminder could not be sent"));
      await markReminded(db, member.id, at);
    }
    const paused = await pauseOverdueReverifications(db, at);
    if (reminders.length + paused > 0) {
      helpers.logger.info(`re-verification: ${reminders.length} reminders, ${paused} paused`);
    }
  };
}
