import {
  type AccountStatus,
  canAppeal,
  canPause,
  canRequestDeletion,
  canResume,
  IDENTITY_RETENTION_YEARS,
  plusYears,
} from "@epilove/core";
import type { Database } from "@epilove/db";
import { findAccount, requestAccountDeletion, transitionStatus } from "@epilove/db/repositories/accounts";
import { findDecision, hasAppeal, insertAppeal, listDecisionsFor } from "@epilove/db/repositories/admin";
import { writeAudit } from "@epilove/db/repositories/safety";
import { ORPCError } from "@orpc/server";
import { os, requireViewer } from "../procedures";

async function summary(db: Database, userId: string) {
  const account = await findAccount(db, userId);
  if (!account) {
    throw new ORPCError("UNAUTHORIZED");
  }
  return { email: account.email, schoolSlug: account.schoolSlug, status: account.status as AccountStatus };
}

/** Pause (SAF-05) and self-service deletion (SAF-14). */
export const account = {
  summary: os.account.summary.use(requireViewer).handler(async ({ context }) => {
    return summary(context.database(), context.viewer.userId);
  }),

  pause: os.account.pause.use(requireViewer).handler(async ({ context, errors }) => {
    const db = context.database();
    const { userId } = context.viewer;
    const current = await summary(db, userId);
    if (current.status !== "paused") {
      if (!canPause(current.status) || !(await transitionStatus(db, userId, "active", "paused"))) {
        throw errors.NOT_ALLOWED();
      }
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
