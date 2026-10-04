import { REPORT_CONTEXTS, REPORT_PRIORITIES, REPORT_REASONS } from "@atomes/core";
import { sql } from "drizzle-orm";
import { check, index, jsonb, pgTable, primaryKey, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { bytea, createdAt, id, oneOf } from "./columns";
import { appUser } from "./users";

export const REPORT_STATUSES = ["open", "in_review", "resolved", "dismissed"] as const;
export const MODERATION_ACTIONS = [
  "warning",
  "restriction",
  "suspension",
  "ban",
  "content_removal",
  "no_action",
] as const;
export const APPEAL_STATUSES = ["pending", "upheld", "overturned"] as const;

/** Immediate and mutual: neither member sees the other any more (SAF-01). */
export const block = pgTable(
  "block",
  {
    blockerId: uuid()
      .notNull()
      .references(() => appUser.id, { onDelete: "cascade" }),
    blockedId: uuid()
      .notNull()
      .references(() => appUser.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.blockerId, t.blockedId] }),
    check("block_not_self", sql`${t.blockerId} <> ${t.blockedId}`),
    index().on(t.blockedId),
  ],
);

/** Hide from a specific address (SAF-04). Only the HMAC is stored, plus a partial hint for its owner. */
export const hiddenContact = pgTable(
  "hidden_contact",
  {
    id: id(),
    userId: uuid()
      .notNull()
      .references(() => appUser.id, { onDelete: "cascade" }),
    emailHmac: text().notNull(),
    /** "ca…@epita.fr", shown back to the member who hid the address. */
    hint: text().notNull(),
    createdAt: createdAt(),
  },
  (t) => [unique().on(t.userId, t.emailHmac), index().on(t.emailHmac)],
);

/** Reports outlive the accounts involved (kept one year after the decision). */
export const report = pgTable(
  "report",
  {
    id: id(),
    reporterId: uuid().references(() => appUser.id, { onDelete: "set null" }),
    reportedId: uuid().references(() => appUser.id, { onDelete: "set null" }),
    context: text({ enum: REPORT_CONTEXTS }).notNull(),
    contextRef: text(),
    reason: text({ enum: REPORT_REASONS }).notNull(),
    /** Free-text details, encrypted by the application. */
    detailsEncrypted: bytea(),
    keyId: text(),
    priority: text({ enum: REPORT_PRIORITIES }).notNull(),
    status: text({ enum: REPORT_STATUSES }).notNull().default("open"),
    assignedTo: uuid().references(() => appUser.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    resolvedAt: timestamp({ withTimezone: true }),
  },
  (t) => [
    check("report_context_check", oneOf(t.context, REPORT_CONTEXTS)),
    check("report_reason_check", oneOf(t.reason, REPORT_REASONS)),
    check("report_priority_check", oneOf(t.priority, REPORT_PRIORITIES)),
    check("report_status_check", oneOf(t.status, REPORT_STATUSES)),
    index().on(t.status, t.priority, t.createdAt),
    index().on(t.reportedId),
  ],
);

/** Every sanction comes with a written statement of reasons (DSA art. 17). */
export const moderationAction = pgTable(
  "moderation_action",
  {
    id: id(),
    reportId: uuid().references(() => report.id, { onDelete: "set null" }),
    targetUserId: uuid().references(() => appUser.id, { onDelete: "set null" }),
    moderatorId: uuid().references(() => appUser.id, { onDelete: "set null" }),
    action: text({ enum: MODERATION_ACTIONS }).notNull(),
    rule: text().notNull(),
    statement: text().notNull(),
    expiresAt: timestamp({ withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [check("moderation_action_check", oneOf(t.action, MODERATION_ACTIONS)), index().on(t.targetUserId)],
);

export const appeal = pgTable(
  "appeal",
  {
    id: id(),
    actionId: uuid()
      .notNull()
      .references(() => moderationAction.id, { onDelete: "cascade" }),
    text: text().notNull(),
    status: text({ enum: APPEAL_STATUSES }).notNull().default("pending"),
    reviewerId: uuid().references(() => appUser.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    decidedAt: timestamp({ withTimezone: true }),
  },
  (t) => [check("appeal_status_check", oneOf(t.status, APPEAL_STATUSES))],
);

/**
 * Append-only trail of staff actions. No foreign keys on purpose: entries
 * must survive the deletion of the accounts they mention.
 */
export const auditLog = pgTable(
  "audit_log",
  {
    id: id(),
    actorId: uuid(),
    action: text().notNull(),
    targetType: text().notNull(),
    targetId: text(),
    metadata: jsonb(),
    createdAt: createdAt(),
  },
  (t) => [index().on(t.targetType, t.targetId), index().on(t.actorId)],
);
