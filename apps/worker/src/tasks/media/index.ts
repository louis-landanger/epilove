import { createDatabase, type Database, databaseUrlFromEnv } from "@epilove/db";
import { createStorage, type Storage, storageConfigFromEnv } from "@epilove/media/storage";
import type { TaskList } from "graphile-worker";
import { type MediaDependencies, processPhotoTask } from "./process-photo";
import { processSelfieTask } from "./process-selfie";
import { purgeUploadsTask } from "./purge-uploads";

let database: Database | undefined;
let storage: Storage | undefined;

const fromEnv: MediaDependencies = {
  database: () => {
    database ??= createDatabase(databaseUrlFromEnv(), { maxConnections: 4 }).db;
    return database;
  },
  storage: () => {
    storage ??= createStorage(storageConfigFromEnv());
    return storage;
  },
};

/** Photo pipeline jobs (PRO-01) and verification selfies (ONB-08). */
export function mediaTasks(dependencies: MediaDependencies = fromEnv): TaskList {
  return {
    "media/process-photo": processPhotoTask(dependencies),
    "media/process-selfie": processSelfieTask(dependencies),
    "media/purge-uploads": purgeUploadsTask(dependencies),
  };
}

export const mediaCrontab = ["17 * * * * media/purge-uploads"];
