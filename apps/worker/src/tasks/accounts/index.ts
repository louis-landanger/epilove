import { createDatabase, type Database, databaseUrlFromEnv } from "@epilove/db";
import { createStorage, type Storage, storageConfigFromEnv } from "@epilove/media/storage";
import type { TaskList } from "graphile-worker";
import { exportTask } from "./export";
import { liftSanctionsTask } from "./lift-sanctions";
import { type AccountsDependencies, purgeTask } from "./purge";
import { resumePausedTask } from "./resume-paused";
import { reverificationTask } from "./reverification";

let database: Database | undefined;
let storage: Storage | undefined;

const fromEnv: AccountsDependencies = {
  database: () => {
    database ??= createDatabase(databaseUrlFromEnv(), { maxConnections: 2 }).db;
    return database;
  },
  storage: () => {
    storage ??= createStorage(storageConfigFromEnv());
    return storage;
  },
};

/** Account lifecycle jobs (SAF-14). */
export function accountsTasks(dependencies: AccountsDependencies = fromEnv): TaskList {
  return {
    "accounts/export": exportTask(dependencies),
    "accounts/lift-sanctions": liftSanctionsTask(dependencies),
    "accounts/purge": purgeTask(dependencies),
    "accounts/resume-paused": resumePausedTask(dependencies),
    "accounts/reverification": reverificationTask(dependencies),
  };
}

/** Purge every night at 03:41 UTC; lapsed sanctions and scheduled pauses every hour. */
export const accountsCrontab = [
  "41 3 * * * accounts/purge",
  "7 * * * * accounts/lift-sanctions",
  "9 * * * * accounts/resume-paused",
  "23 8 * * * accounts/reverification",
];
