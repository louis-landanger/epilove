import { reportPriority, SAFETY_QUOTAS, shouldHoldProfile } from "@atomes/core";
import { encryptText } from "@atomes/crypto";
import {
  accountExists,
  countIndependentReporters,
  deleteBlock,
  findRecentReport,
  holdProfile,
  insertBlock,
  insertReport,
  listBlocked,
  writeAudit,
} from "@atomes/db/repositories/safety";
import { withinQuota } from "../lib/quota";
import { os, requireViewer } from "../procedures";

const DAY_SECONDS = 86_400;
/** A report repeated within this window is the same report (double tap, network retry). */
const REPORT_DEDUPLICATION_MS = DAY_SECONDS * 1000;

/**
 * Safety actions callable from every surface (profile, chat, deck): SAF-01
 * and SAF-02. Blocks are mutual and silent; reports are triaged by priority,
 * their details encrypted, and serious ones hide the profile at once.
 */
export const safety = {
  block: os.safety.block.use(requireViewer).handler(async ({ context, input, errors }) => {
    const { userId } = context.viewer;
    const db = context.database();
    if (input.userId === userId || !(await accountExists(db, input.userId))) {
      throw errors.NOT_FOUND();
    }
    if (!(await withinQuota(context.services, "block", userId, SAFETY_QUOTAS.blocksPerDay, DAY_SECONDS))) {
      throw errors.RATE_LIMITED();
    }
    await insertBlock(db, userId, input.userId);
    return { ok: true as const };
  }),

  unblock: os.safety.unblock.use(requireViewer).handler(async ({ context, input }) => {
    await deleteBlock(context.database(), context.viewer.userId, input.userId);
    return { ok: true as const };
  }),

  report: os.safety.report.use(requireViewer).handler(async ({ context, input, errors }) => {
    const { userId } = context.viewer;
    const db = context.database();
    const now = context.services.now();
    if (input.reportedId === userId || !(await accountExists(db, input.reportedId))) {
      throw errors.NOT_FOUND();
    }
    const key = {
      reporterId: userId,
      reportedId: input.reportedId,
      context: input.context,
      contextRef: input.contextRef ?? null,
      reason: input.reason,
    };
    const existing = await findRecentReport(db, key, new Date(now.getTime() - REPORT_DEDUPLICATION_MS));
    if (existing) {
      if (input.alsoBlock) {
        await insertBlock(db, userId, input.reportedId);
      }
      return { reportId: existing };
    }
    if (!(await withinQuota(context.services, "report", userId, SAFETY_QUOTAS.reportsPerDay, DAY_SECONDS))) {
      throw errors.RATE_LIMITED();
    }

    const priority = reportPriority(input.reason);
    const details = input.details?.trim()
      ? encryptText(context.services.keyRing(), input.details.trim())
      : null;

    const reportId = await db.transaction(async (tx) => {
      const id = await insertReport(tx, { ...key, priority, details });
      if (input.alsoBlock) {
        await insertBlock(tx, userId, input.reportedId);
      }
      const reporters = await countIndependentReporters(tx, input.reportedId, [priority]);
      if (shouldHoldProfile(priority, reporters) && (await holdProfile(tx, input.reportedId, now))) {
        await writeAudit(tx, {
          actorId: null,
          action: "profile.held",
          targetType: "user",
          targetId: input.reportedId,
          metadata: { reportId: id, priority, reporters },
        });
      }
      return id;
    });
    return { reportId };
  }),

  blocked: os.safety.blocked.use(requireViewer).handler(async ({ context }) => {
    const rows = await listBlocked(context.database(), context.viewer.userId);
    return {
      people: rows.map((row) => ({
        userId: row.userId,
        firstName: row.firstName,
        blockedAt: row.blockedAt.toISOString(),
      })),
    };
  }),
};
