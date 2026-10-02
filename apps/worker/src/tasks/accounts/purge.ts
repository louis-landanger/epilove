import { ACCOUNT_PURGE_DELAY_DAYS, calendarDateIn, LYON_CAMPUS, plusDays } from "@epilove/core";
import type { Database } from "@epilove/db";
import {
  deleteAccountRow,
  listAccountsToPurge,
  listStorageKeys,
  purgeExpiredIdentities,
  purgeExpiredSignupBlocks,
} from "@epilove/db/repositories/accounts";
import { writeAudit } from "@epilove/db/repositories/safety";
import type { Storage } from "@epilove/media/storage";
import type { Task } from "graphile-worker";

export interface AccountsDependencies {
  readonly database: () => Database;
  readonly storage: () => Storage;
  readonly now?: () => Date;
}

/**
 * Daily retention job (docs/05-donnees.md, section 7): erases accounts
 * deleted more than 30 days ago (photos in storage included), the legal
 * identity vault once its period is over, and expired underage blocks.
 * The audit log only records counts.
 */
export function purgeTask({ database, storage, now = () => new Date() }: AccountsDependencies): Task {
  return async (_payload, helpers) => {
    const db = database();
    const at = now();
    const accounts = await listAccountsToPurge(db, plusDays(at, -ACCOUNT_PURGE_DELAY_DAYS));
    for (const { id } of accounts) {
      // A photo row points at its published object, or at its quarantine object until processed.
      for (const key of await listStorageKeys(db, id)) {
        await storage().remove(key);
      }
      await deleteAccountRow(db, id);
    }
    const identities = await purgeExpiredIdentities(db, at);
    const blocks = await purgeExpiredSignupBlocks(db, calendarDateIn(LYON_CAMPUS.timeZone, at));
    if (accounts.length + identities + blocks > 0) {
      await writeAudit(db, {
        actorId: null,
        action: "retention.purge",
        targetType: "system",
        targetId: null,
        metadata: { accounts: accounts.length, identities, signupBlocks: blocks },
      });
      helpers.logger.info(`purged ${accounts.length} accounts, ${identities} identities, ${blocks} blocks`);
    }
  };
}
