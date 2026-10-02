import {
  type AccountStatus,
  canAppeal,
  canPause,
  canRequestDeletion,
  canResume,
  IDENTITY_RETENTION_YEARS,
  isValidPauseEnd,
  plusYears,
} from "@epilove/core";
import type { Database } from "@epilove/db";
import { enqueueJob } from "@epilove/db";
import {
  findAccount,
  requestAccountDeletion,
  setAccountLocale,
  transitionStatus,
} from "@epilove/db/repositories/accounts";
import { findDecision, hasAppeal, insertAppeal, listDecisionsFor } from "@epilove/db/repositories/admin";
import { countRecentExports, insertExport, listExports } from "@epilove/db/repositories/exports";
import { writeAudit } from "@epilove/db/repositories/safety";
import { ORPCError } from "@orpc/server";
import { os, requireViewer } from "../procedures";

async function summary(db: Database, userId: string) {
  const account = await findAccount(db, userId);
  if (!account) {
    throw new ORPCError("UNAUTHORIZED");
  }
  return {
    email: account.email,
    schoolSlug: account.schoolSlug,
    status: account.status as AccountStatus,
    pausedUntil: account.status === "paused" ? (account.pausedUntil?.toISOString() ?? null) : null,
    locale: account.locale,
  };
}

const EXPORTS_PER_DAY = 2;

/** Pause (SAF-05, SAF-08), decisions and appeals (ADM-04), export and deletion (SAF-14). */
export const account = {
  summary: os.account.summary.use(requireViewer).handler(async ({ context }) => {
    return summary(context.database(), context.viewer.userId);
  }),

  pause: os.account.pause.use(requireViewer).handler(async ({ context, input, errors }) => {
    const db = context.database();
    const { userId } = context.viewer;
    const until = input.until ? new Date(input.until) : null;
    if (until && !isValidPauseEnd(until, context.services.now())) {
      throw errors.INVALID_VALUE();
    }
    const current = await summary(db, userId);
    if (current.status === "paused") {
      // Changing the end date of a pause already running.
      await transitionStatus(db, userId, "paused", "paused", until);
    } else if (
      !canPause(current.status) ||
      !(await transitionStatus(db, userId, "active", "paused", until))
    ) {
      throw errors.NOT_ALLOWED();
    }
    return summary(db, userId);
  }),

  resume: os.account.resume.use(requireViewer).handler(async ({ context, errors }) => {
    const db = context.database();
    const { userId } = context.viewer;
    const current = await summary(db, userId);
    if (current.status !== "active") {
      if (!canResume(current.status) || !(await transitionStatus(db, userId, "paused", "active"))) {
        throw errors.NOT_ALLOWED();
      }
    }
    return summary(db, userId);
  }),

  setLocale: os.account.setLocale.use(requireViewer).handler(async ({ context, input }) => {
    const db = context.database();
    await setAccountLocale(db, context.viewer.userId, input.locale);
    return summary(db, context.viewer.userId);
  }),

  decisions: os.account.decisions.use(requireViewer).handler(async ({ context }) => {
    const rows = await listDecisionsFor(context.database(), context.viewer.userId);
    const now = context.services.now();
    return {
      decisions: rows.map((row) => ({
        id: row.id,
        action: row.action,
        rule: row.rule,
        statement: row.statement,
        createdAt: row.createdAt.toISOString(),
        expiresAt: row.expiresAt?.toISOString() ?? null,
        appeal: row.appealStatus,
        canAppeal: canAppeal(row, row.appealStatus !== null, now),
      })),
    };
  }),

  appeal: os.account.appeal.use(requireViewer).handler(async ({ context, input, errors }) => {
    const db = context.database();
    const decision = await findDecision(db, input.decisionId);
    if (decision?.targetUserId !== context.viewer.userId) {
      throw errors.NOT_FOUND();
    }
    if (!canAppeal(decision, await hasAppeal(db, decision.id), context.services.now())) {
      throw errors.NOT_ALLOWED();
    }
    await db.transaction(async (tx) => {
      const appealId = await insertAppeal(tx, decision.id, input.text.trim());
      await writeAudit(tx, {
        actorId: context.viewer.userId,
        action: "appeal.filed",
        targetType: "appeal",
        targetId: appealId,
      });
    });
    return { ok: true as const };
  }),

  requestExport: os.account.requestExport.use(requireViewer).handler(async ({ context, errors }) => {
    const db = context.database();
    const { userId } = context.viewer;
    const now = context.services.now();
    if ((await countRecentExports(db, userId, new Date(now.getTime() - 86_400_000))) >= EXPORTS_PER_DAY) {
      throw errors.RATE_LIMITED();
    }
    const exportId = await db.transaction(async (tx) => {
      const id = await insertExport(tx, userId);
      if (!id) {
        throw new ORPCError("INTERNAL_SERVER_ERROR");
      }
      await enqueueJob(tx, "accounts/export", { exportId: id }, { jobKey: `export:${id}` });
      return id;
    });
    return { exportId };
  }),

  exports: os.account.exports.use(requireViewer).handler(async ({ context }) => {
    const now = context.services.now();
    const rows = await listExports(context.database(), context.viewer.userId);
    return {
      exports: rows.map((row) => {
        const available = row.status === "ready" && row.expiresAt !== null && row.expiresAt > now;
        return {
          id: row.id,
          status: row.status,
          createdAt: row.createdAt.toISOString(),
          expiresAt: row.expiresAt?.toISOString() ?? null,
          downloadPath: available ? `/api/export/${row.id}` : null,
        };
      }),
    };
  }),

  delete: os.account.delete.use(requireViewer).handler(async ({ context, errors }) => {
    const db = context.database();
    const { userId } = context.viewer;
    const now = context.services.now();
    const current = await summary(db, userId);
    if (!canRequestDeletion(current.status)) {
      throw errors.NOT_ALLOWED();
    }
    await db.transaction(async (tx) => {
      if (await requestAccountDeletion(tx, userId, now, plusYears(now, IDENTITY_RETENTION_YEARS))) {
        await writeAudit(tx, {
          actorId: userId,
          action: "account.deletion_requested",
          targetType: "user",
          targetId: userId,
        });
      }
    });
    await context.services.revokeSessions(userId).catch(() => {
      console.error("[account] session revocation failed after a deletion request");
    });
    return { ok: true as const };
  }),
};
