import type { AdminMemberCard } from "@atomes/contracts";
import {
  type AccountStatus,
  ageOn,
  canReviewAppeal,
  isValidStatement,
  type Locale,
  REPORT_PRIORITIES,
  REPORT_TARGET_HOURS,
  type Sanction,
  type SanctionInput,
  SCHOOL_HEADCOUNT_ESTIMATES,
  SCHOOL_SLUGS,
  type SchoolSlug,
  sanctionEffect,
} from "@atomes/core";
import { decryptText } from "@atomes/crypto";
import type { Database } from "@atomes/db";
import {
  applyAccountSanction,
  countOpenSeriousReports,
  endSanctionNow,
  findAppeal,
  findDecision,
  findPhotoForModeration,
  findReport,
  identityOf,
  insertModerationAction,
  listAudit,
  listCatalog,
  listPendingAppeals,
  listPendingPhotos,
  listReports,
  memberForModeration,
  moderationOverview,
  releaseProfileHold,
  revertSanctionStatus,
  saveInterest,
  savePrompt,
  setAppealOutcome,
  setPhotoDecision,
  setReportStatus,
} from "@atomes/db/repositories/admin";
import {
  healthMetrics,
  meetingMetrics,
  memberMetrics,
  moderationMetrics,
} from "@atomes/db/repositories/admin-metrics";
import {
  decideVerification,
  listComparablePhotos,
  listPendingVerifications,
} from "@atomes/db/repositories/profiles-verification";
import { writeAudit } from "@atomes/db/repositories/safety";
import {
  appealOutcomeEmail,
  moderationDecisionEmail,
  photoRejectedEmail,
  reportHandledEmail,
  verificationOutcomeEmail,
} from "@atomes/email";
import { photoUrl } from "@atomes/media";
import { ORPCError } from "@orpc/server";
import type { ApiServices } from "../context";
import { refreshCompleteness } from "../lib/completeness";
import { pseudonymOf } from "../lib/pseudonym";
import { campusToday } from "../lib/time";
import { findWatermarkOwner, normalizeWatermark, watermarkCode } from "../lib/watermark";
import { os, requireRole } from "../procedures";

const staff = requireRole("moderator", "admin");
const adminOnly = requireRole("admin");

/** Account status a decision put in place, to undo when its appeal succeeds. */
const STATUS_SET_BY: Partial<Record<string, "restricted" | "suspended" | "banned">> = {
  restriction: "restricted",
  suspension: "suspended",
  ban: "banned",
};

const PHOTO_REVIEW_SIZE = { width: 600, height: 750, ttlSeconds: 900 } as const;

function pseudonym(services: ApiServices, userId: string | null) {
  return userId ? { userId, pseudonym: pseudonymOf(services.emailHmacSecret(), userId) } : null;
}

/** Sends an email without letting a mail failure undo a decision already saved. */
async function notify(
  services: ApiServices,
  to: { email: string; locale: Locale } | null,
  email: (locale: Locale) => Parameters<ReturnType<ApiServices["mailer"]>["send"]>[1],
) {
  if (!to) {
    return;
  }
  await services
    .mailer()
    .send(to.email, email(to.locale))
    .catch(() => {
      console.error("[admin] notification email could not be sent");
    });
}

async function memberCard(
  db: Database,
  services: ApiServices,
  userId: string,
): Promise<AdminMemberCard | null> {
  const data = await memberForModeration(db, userId);
  if (!data) {
    return null;
  }
  const imgproxy = services.imgproxy();
  const today = campusToday(services.now());
  return {
    member: { userId, pseudonym: pseudonymOf(services.emailHmacSecret(), userId) },
    schoolSlug: data.account.schoolSlug,
    age: data.account.birthDate ? ageOn(data.account.birthDate, today) : null,
    graduationYear: data.account.graduationYear,
    status: data.account.status as AccountStatus,
    joinedAt: data.account.createdAt.toISOString(),
    held: data.account.hiddenAt !== null,
    photos: data.photos.map((item) => ({
      id: item.id,
      status: item.status,
      url: item.stage === "ready" ? photoUrl(imgproxy, item.storageKey, PHOTO_REVIEW_SIZE) : null,
    })),
    prompts: data.prompts.map((item) => ({ question: item.question, answer: item.answer ?? "" })),
    history: {
      reportsReceived: data.reportsReceived,
      distinctReporters: data.distinctReporters,
      blocksReceived: data.blocksReceived,
      actions: data.actions.map((item) => ({
        action: item.action as Sanction,
        rule: item.rule,
        createdAt: item.createdAt.toISOString(),
        expiresAt: item.expiresAt?.toISOString() ?? null,
      })),
    },
  };
}

/** Back-office (ADM-01 to ADM-03, ADM-05, ADM-06). Every write is audited. */
export const admin = {
  me: os.admin.me.use(staff).handler(({ context }) => ({
    role: context.viewer.role as "moderator" | "admin",
    pseudonym: pseudonymOf(context.services.emailHmacSecret(), context.viewer.userId),
    watermark: watermarkCode(context.services.emailHmacSecret(), context.viewer.userId),
  })),

  findWatermark: os.admin.findWatermark.use(staff).handler(async ({ context, input, errors }) => {
    const code = normalizeWatermark(input.code);
    if (!code) {
      throw errors.INVALID_VALUE();
    }
    const db = context.database();
    const owner = await findWatermarkOwner(db, context.services.emailHmacSecret(), code);
    await writeAudit(db, {
      actorId: context.viewer.userId,
      action: "watermark.lookup",
      targetType: "user",
      targetId: owner,
      metadata: { found: owner !== null, justification: input.justification.trim() },
    });
    return { member: pseudonym(context.services, owner) };
  }),

  overview: os.admin.overview.use(staff).handler(({ context }) => moderationOverview(context.database())),

  dashboard: os.admin.dashboard.use(staff).handler(async ({ context, input }) => {
    const db = context.database();
    const now = context.services.now();
    const [members, moderation, meeting, health] = await Promise.all([
      memberMetrics(db, now, input.days),
      moderationMetrics(db, now, input.days),
      meetingMetrics(db, now, input.days),
      healthMetrics(db, now),
    ]);
    return {
      generatedAt: now.toISOString(),
      periodDays: input.days,
      members: {
        ...members,
        byStatus: members.byStatus as Partial<Record<AccountStatus, number>>,
        schools: members.schools.map((row) => ({
          ...row,
          headcount: (SCHOOL_SLUGS as readonly string[]).includes(row.slug)
            ? SCHOOL_HEADCOUNT_ESTIMATES[row.slug as SchoolSlug]
            : null,
        })),
      },
      moderation: {
        ...moderation,
        reports: REPORT_PRIORITIES.map((priority) => {
          const row = moderation.reports.find((entry) => entry.priority === priority);
          return {
            priority,
            targetHours: REPORT_TARGET_HOURS[priority],
            open: row?.open ?? 0,
            oldestOpenHours: row?.oldestOpenHours ?? null,
            handled: row?.handled ?? 0,
            within24h: row?.within24h ?? 0,
            withinTarget: row?.withinTarget ?? 0,
            medianHours: row?.medianHours ?? null,
            p90Hours: row?.p90Hours ?? null,
          };
        }),
        sanctions: moderation.sanctions as Partial<Record<Sanction, number>>,
      },
      meeting,
      health: { version: context.version, ...health },
    };
  }),

  verificationQueue: os.admin.verificationQueue.use(staff).handler(async ({ context }) => {
    const db = context.database();
    const { rows, total } = await listPendingVerifications(db, 20);
    const imgproxy = context.services.imgproxy();
    const now = context.services.now();
    const url = (key: string) => photoUrl(imgproxy, key, { ...PHOTO_REVIEW_SIZE, now });
    const verifications = await Promise.all(
      rows.map(async (row) => ({
        id: row.id,
        member: pseudonym(context.services, row.userId) ?? { userId: row.userId, pseudonym: "" },
        gesture: row.gesture,
        selfieUrl: url(row.storageKey ?? ""),
        photos: (await listComparablePhotos(db, row.userId)).map((item) => ({
          id: item.id,
          url: url(item.storageKey),
        })),
        submittedAt: row.updatedAt.toISOString(),
      })),
    );
    return { total, verifications };
  }),

  reviewVerification: os.admin.reviewVerification.use(staff).handler(async ({ context, input, errors }) => {
    const db = context.database();
    const moderatorId = context.viewer.userId;
    const at = context.services.now();
    const approved = input.decision === "approve";
    const decided = await db.transaction(async (tx) => {
      const result = await decideVerification(tx, input.id, {
        status: approved ? "approved" : "rejected",
        rejection: input.decision === "reject" ? input.reason : null,
        reviewedBy: moderatorId,
        at,
      });
      if (result) {
        await writeAudit(tx, {
          actorId: moderatorId,
          action: approved ? "verification.approved" : "verification.rejected",
          targetType: "photo_verification",
          targetId: input.id,
          metadata: input.decision === "reject" ? { reason: input.reason } : undefined,
        });
      }
      return result;
    });
    if (!decided) {
      throw errors.NOT_FOUND();
    }
    // The selfie is only kept for the review (data minimisation).
    if (decided.storageKey) {
      await context.services
        .storage()
        .remove(decided.storageKey)
        .catch(() => console.error("[admin] verification selfie could not be deleted"));
    }
    await refreshCompleteness(db, decided.userId);
    const identity = await identityOf(db, decided.userId);
    await notify(context.services, identity, (locale) =>
      verificationOutcomeEmail(
        input.decision === "reject" ? { approved: false, reason: input.reason } : { approved: true },
        locale,
      ),
    );
    return { ok: true as const };
  }),

  photoQueue: os.admin.photoQueue.use(staff).handler(async ({ context, input }) => {
    const { rows, total } = await listPendingPhotos(context.database(), {
      after: input.cursor ? new Date(input.cursor) : undefined,
      limit: input.limit,
    });
    const imgproxy = context.services.imgproxy();
    return {
      total,
      photos: rows.map((row) => ({
        id: row.id,
        member: {
          userId: row.userId,
          pseudonym: pseudonymOf(context.services.emailHmacSecret(), row.userId),
        },
        url: photoUrl(imgproxy, row.storageKey, PHOTO_REVIEW_SIZE),
        width: row.width,
        height: row.height,
        position: row.position,
        uploadedAt: row.createdAt.toISOString(),
      })),
    };
  }),

  moderatePhoto: os.admin.moderatePhoto.use(staff).handler(async ({ context, input, errors }) => {
    const db = context.database();
    const moderatorId = context.viewer.userId;
    const photo = await findPhotoForModeration(db, input.photoId);
    if (photo?.stage !== "ready") {
      throw errors.NOT_FOUND();
    }
    const at = context.services.now().toISOString();
    await db.transaction(async (tx) => {
      if (input.decision === "approve") {
        await setPhotoDecision(tx, photo.id, "approved", { decidedBy: moderatorId, decidedAt: at });
      } else {
        await setPhotoDecision(tx, photo.id, "rejected", {
          decidedBy: moderatorId,
          decidedAt: at,
          reason: input.reason,
        });
      }
      await writeAudit(tx, {
        actorId: moderatorId,
        action: input.decision === "approve" ? "photo.approved" : "photo.rejected",
        targetType: "photo",
        targetId: photo.id,
        metadata: input.decision === "reject" ? { reason: input.reason } : undefined,
      });
    });
    await refreshCompleteness(db, photo.userId);
    if (input.decision === "reject") {
      const identity = await identityOf(db, photo.userId);
      await notify(context.services, identity, (locale) => photoRejectedEmail(input.reason, locale));
    }
    return { ok: true as const };
  }),

  reports: os.admin.reports.use(staff).handler(async ({ context, input }) => {
    const rows = await listReports(context.database(), {
      status: input.status,
      before: input.cursor ? new Date(input.cursor) : undefined,
      limit: input.limit,
    });
    return {
      reports: rows.map((row) => ({
        id: row.id,
        priority: row.priority,
        reason: row.reason,
        context: row.context,
        status: row.status,
        createdAt: row.createdAt.toISOString(),
        reported: pseudonym(context.services, row.reportedId),
      })),
    };
  }),

  report: os.admin.report.use(staff).handler(async ({ context, input, errors }) => {
    const db = context.database();
    const row = await findReport(db, input.id);
    if (!row) {
      throw errors.NOT_FOUND();
    }
    const details =
      row.detailsEncrypted && row.keyId
        ? decryptText(context.services.keyRing(), { keyId: row.keyId, data: row.detailsEncrypted })
        : null;
    await writeAudit(db, {
      actorId: context.viewer.userId,
      action: "report.viewed",
      targetType: "report",
      targetId: row.id,
    });
    if (row.status === "open") {
      await setReportStatus(db, row.id, "in_review", context.viewer.userId, context.services.now());
    }
    return {
      id: row.id,
      priority: row.priority,
      reason: row.reason,
      context: row.context,
      status: row.status === "open" ? "in_review" : row.status,
      createdAt: row.createdAt.toISOString(),
      contextRef: row.contextRef,
      details,
      reporter: pseudonym(context.services, row.reporterId),
      reported: pseudonym(context.services, row.reportedId),
      reportedCard: row.reportedId ? await memberCard(db, context.services, row.reportedId) : null,
    };
  }),

  decide: os.admin.decide.use(staff).handler(async ({ context, input, errors }) => {
    const db = context.database();
    const moderatorId = context.viewer.userId;
    const now = context.services.now();
    const row = await findReport(db, input.reportId);
    if (!row) {
      throw errors.NOT_FOUND();
    }
    if (row.status === "resolved" || row.status === "dismissed") {
      throw errors.ALREADY_DECIDED();
    }
    const { decision } = input;
    if (decision.action !== "no_action" && !isValidStatement(decision.statement)) {
      throw errors.STATEMENT_REQUIRED();
    }
    const sanction: SanctionInput =
      decision.action === "restriction" || decision.action === "suspension"
        ? { action: decision.action, durationDays: decision.durationDays }
        : { action: decision.action };
    const effect = sanctionEffect(sanction, now);
    const targetId = row.reportedId;
    const rule = decision.action === "no_action" ? "none" : decision.rule;
    const statement = decision.action === "no_action" ? "" : decision.statement.trim();

    await db.transaction(async (tx) => {
      await insertModerationAction(tx, {
        reportId: row.id,
        targetUserId: targetId,
        moderatorId,
        action: decision.action,
        rule,
        statement,
        expiresAt: effect.expiresAt,
      });
      await setReportStatus(
        tx,
        row.id,
        decision.action === "no_action" ? "dismissed" : "resolved",
        moderatorId,
        now,
      );
      if (targetId) {
        if (effect.status) {
          await applyAccountSanction(tx, targetId, effect.status as "restricted" | "suspended" | "banned");
        }
        if (decision.action === "content_removal" && row.context === "photo" && row.contextRef) {
          const photo = await findPhotoForModeration(tx, row.contextRef);
          if (photo?.userId === targetId) {
            await setPhotoDecision(tx, photo.id, "rejected", {
              decidedBy: moderatorId,
              decidedAt: now.toISOString(),
              reason: "report",
            });
          }
        }
        // The hold stays while another serious report waits for a decision.
        if (effect.releaseHold && (await countOpenSeriousReports(tx, targetId, row.id)) === 0) {
          await releaseProfileHold(tx, targetId);
        }
      }
      await writeAudit(tx, {
        actorId: moderatorId,
        action: `decision.${decision.action}`,
        targetType: "report",
        targetId: row.id,
        metadata: { target: targetId, rule, expiresAt: effect.expiresAt?.toISOString() ?? null },
      });
    });

    if (targetId && effect.revokeSessions) {
      await context.services.revokeSessions(targetId).catch(() => {
        console.error("[admin] session revocation failed after a ban");
      });
    }
    if (targetId && decision.action !== "no_action") {
      const identity = await identityOf(db, targetId);
      await notify(context.services, identity, (locale) =>
        moderationDecisionEmail({
          action: decision.action,
          rule,
          statement,
          until: effect.expiresAt,
          appealUrl: `${context.services.appUrl()}/compte/recours`,
          locale,
        }),
      );
    }
    if (row.reporterId) {
      const reporter = await identityOf(db, row.reporterId);
      await notify(context.services, reporter, (locale) => reportHandledEmail(locale));
    }
    return { ok: true as const };
  }),

  member: os.admin.member.use(staff).handler(async ({ context, input, errors }) => {
    const card = await memberCard(context.database(), context.services, input.userId);
    if (!card) {
      throw errors.NOT_FOUND();
    }
    return card;
  }),

  appeals: os.admin.appeals.use(staff).handler(async ({ context }) => {
    const rows = await listPendingAppeals(context.database());
    return {
      appeals: rows.map((row) => ({
        id: row.id,
        createdAt: row.createdAt.toISOString(),
        action: row.action as Sanction,
        rule: row.rule,
        member: pseudonym(context.services, row.targetUserId),
      })),
    };
  }),

  appeal: os.admin.appeal.use(staff).handler(async ({ context, input, errors }) => {
    const db = context.database();
    const row = await findAppeal(db, input.id);
    const decision = row ? await findDecision(db, row.actionId) : null;
    if (!row || !decision) {
      throw errors.NOT_FOUND();
    }
    return {
      id: row.id,
      text: row.text,
      status: row.status,
      createdAt: row.createdAt.toISOString(),
      decision: {
        action: decision.action as Sanction,
        rule: decision.rule,
        statement: decision.statement,
        createdAt: decision.createdAt.toISOString(),
        decidedBy: decision.moderatorId
          ? pseudonymOf(context.services.emailHmacSecret(), decision.moderatorId)
          : null,
        reportId: decision.reportId,
      },
      canReview: canReviewAppeal(context.viewer.userId, decision.moderatorId),
      memberCard: decision.targetUserId
        ? await memberCard(db, context.services, decision.targetUserId)
        : null,
    };
  }),

  decideAppeal: os.admin.decideAppeal.use(staff).handler(async ({ context, input, errors }) => {
    const db = context.database();
    const reviewerId = context.viewer.userId;
    const now = context.services.now();
    const row = await findAppeal(db, input.id);
    const decision = row ? await findDecision(db, row.actionId) : null;
    if (!row || !decision) {
      throw errors.NOT_FOUND();
    }
    if (!canReviewAppeal(reviewerId, decision.moderatorId)) {
      throw errors.CONFLICT_OF_INTEREST();
    }
    const overturned = input.outcome === "overturned";
    await db.transaction(async (tx) => {
      if (!(await setAppealOutcome(tx, row.id, input.outcome, reviewerId, now))) {
        throw errors.ALREADY_DECIDED();
      }
      if (overturned && decision.targetUserId) {
        const status = STATUS_SET_BY[decision.action];
        if (status) {
          await revertSanctionStatus(tx, decision.targetUserId, status);
        }
        await endSanctionNow(tx, decision.id, now);
      }
      await writeAudit(tx, {
        actorId: reviewerId,
        action: `appeal.${input.outcome}`,
        targetType: "appeal",
        targetId: row.id,
        metadata: { decision: decision.id },
      });
    });
    if (decision.targetUserId) {
      const identity = await identityOf(db, decision.targetUserId);
      await notify(context.services, identity, (locale) =>
        appealOutcomeEmail({ overturned, statement: input.statement.trim(), locale }),
      );
    }
    return { ok: true as const };
  }),

  revealIdentity: os.admin.revealIdentity.use(staff).handler(async ({ context, input, errors }) => {
    const db = context.database();
    const identity = await identityOf(db, input.userId);
    if (!identity) {
      throw errors.NOT_FOUND();
    }
    await writeAudit(db, {
      actorId: context.viewer.userId,
      action: "identity.revealed",
      targetType: "user",
      targetId: input.userId,
      metadata: { justification: input.justification.slice(0, 500) },
    });
    return { firstName: identity.firstName, email: identity.email };
  }),

  auditLog: os.admin.auditLog.use(staff).handler(async ({ context, input }) => {
    const rows = await listAudit(context.database(), {
      before: input.cursor ? new Date(input.cursor) : undefined,
      limit: input.limit,
    });
    const secret = context.services.emailHmacSecret();
    return {
      entries: rows.map((row) => ({
        id: row.id,
        actor: row.actorId ? pseudonymOf(secret, row.actorId) : null,
        action: row.action,
        targetType: row.targetType,
        target: row.targetType === "user" && row.targetId ? pseudonymOf(secret, row.targetId) : row.targetId,
        metadata: (row.metadata as Record<string, unknown> | null) ?? null,
        createdAt: row.createdAt.toISOString(),
      })),
    };
  }),

  catalog: os.admin.catalog.use(adminOnly).handler(async ({ context }) => {
    const { prompts, interests } = await listCatalog(context.database());
    return {
      prompts: prompts.map(({ createdAt: _createdAt, ...rest }) => rest),
      interests,
    };
  }),

  savePrompt: os.admin.savePrompt.use(adminOnly).handler(async ({ context, input, errors }) => {
    const db = context.database();
    try {
      const row = await savePrompt(db, input);
      if (!row) {
        throw errors.CONFLICT();
      }
      await writeAudit(db, {
        actorId: context.viewer.userId,
        action: input.id ? "catalog.prompt_updated" : "catalog.prompt_created",
        targetType: "prompt",
        targetId: row.id,
      });
      const { createdAt: _createdAt, ...rest } = row;
      return rest;
    } catch (error) {
      if (error instanceof ORPCError) throw error;
      throw errors.CONFLICT();
    }
  }),

  saveInterest: os.admin.saveInterest.use(adminOnly).handler(async ({ context, input, errors }) => {
    const db = context.database();
    try {
      const row = await saveInterest(db, input);
      if (!row) {
        throw errors.CONFLICT();
      }
      await writeAudit(db, {
        actorId: context.viewer.userId,
        action: input.id ? "catalog.interest_updated" : "catalog.interest_created",
        targetType: "interest",
        targetId: row.id,
      });
      return row;
    } catch (error) {
      if (error instanceof ORPCError) throw error;
      throw errors.CONFLICT();
    }
  }),
};
