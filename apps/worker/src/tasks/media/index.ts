import { createDatabase, type Database, databaseUrlFromEnv } from "@atomes/db";
import { createStorage, type Storage, storageConfigFromEnv } from "@atomes/media/storage";
import type { TaskList } from "graphile-worker";
import { type MediaDependencies, processPhotoTask } from "./process-photo";
import { processSelfieTask } from "./process-selfie";
import { processVoiceTask } from "./process-voice";
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

/** Photo pipeline jobs (PRO-01), verification selfies (ONB-08) and voice answers (PRO-06). */
export function mediaTasks(dependencies: MediaDependencies = fromEnv): TaskList {
  return {
    "media/process-photo": processPhotoTask(dependencies),
    "media/process-selfie": processSelfieTask(dependencies),
    "media/process-voice": processVoiceTask(dependencies),
    "media/purge-uploads": purgeUploadsTask(dependencies),
  };
}

export const mediaCrontab = ["17 * * * * media/purge-uploads"];
