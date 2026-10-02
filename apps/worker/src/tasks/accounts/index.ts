import { createDatabase, type Database, databaseUrlFromEnv } from "@epilove/db";
import { createStorage, type Storage, storageConfigFromEnv } from "@epilove/media/storage";
import type { TaskList } from "graphile-worker";
import { liftSanctionsTask } from "./lift-sanctions";
import { type AccountsDependencies, purgeTask } from "./purge";

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
    "accounts/lift-sanctions": liftSanctionsTask(dependencies),
    "accounts/purge": purgeTask(dependencies),
  };
}

/** Purge every night at 03:41 UTC; lapsed sanctions every hour. */
export const accountsCrontab = ["41 3 * * * accounts/purge", "7 * * * * accounts/lift-sanctions"];
