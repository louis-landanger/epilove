import {
  ACCOUNT_STATUSES,
  CHARTER_RULES,
  REPORT_CONTEXTS,
  REPORT_PRIORITIES,
  REPORT_REASONS,
  SANCTIONS,
} from "@epilove/core";
import { oc } from "@orpc/contract";
import { z } from "zod";

const page = z.object({ cursor: z.iso.datetime().optional(), limit: z.int().min(1).max(100).default(30) });

/** Staff only ever see a stable pseudonym, until an identity reveal is justified and logged. */
export const memberPseudonym = z.object({ userId: z.uuid(), pseudonym: z.string() });

export const PHOTO_REJECTION_REASONS = [
  "no_face",
  "not_a_person",
  "explicit",
  "violence",
  "minor",
  "contact_details",
  "stolen",
  "low_quality",
] as const;

export const REPORT_STATUSES = ["open", "in_review", "resolved", "dismissed"] as const;

const queuedPhoto = z.object({
  id: z.uuid(),
  member: memberPseudonym,
  url: z.string(),
  width: z.int().nullable(),
  height: z.int().nullable(),
  position: z.int(),
  uploadedAt: z.iso.datetime(),
});

const reportSummary = z.object({
  id: z.uuid(),
  priority: z.enum(REPORT_PRIORITIES),
  reason: z.enum(REPORT_REASONS),
  context: z.enum(REPORT_CONTEXTS),
  status: z.enum(REPORT_STATUSES),
  createdAt: z.iso.datetime(),
  reported: memberPseudonym.nullable(),
});

const memberCard = z.object({
  member: memberPseudonym,
  schoolSlug: z.string(),
  age: z.int().nullable(),
  graduationYear: z.int().nullable(),
  status: z.enum(ACCOUNT_STATUSES),
  joinedAt: z.iso.datetime(),
  held: z.boolean(),
  photos: z.array(
    z.object({
      id: z.uuid(),
      url: z.string().nullable(),
      status: z.enum(["pending", "approved", "rejected"]),
    }),
  ),
  prompts: z.array(z.object({ question: z.string(), answer: z.string() })),
  history: z.object({
    reportsReceived: z.int(),
    distinctReporters: z.int(),
    blocksReceived: z.int(),
    actions: z.array(
      z.object({
        action: z.enum(SANCTIONS),
        rule: z.string(),
        createdAt: z.iso.datetime(),
        expiresAt: z.iso.datetime().nullable(),
      }),
    ),
  }),
});
export type AdminMemberCard = z.infer<typeof memberCard>;

const decisionInput = z.discriminatedUnion("action", [
  z.object({ action: z.literal("no_action") }),
  z.object({
    action: z.enum(["warning", "content_removal", "ban"]),
    rule: z.enum(CHARTER_RULES),
    statement: z.string().max(2000),
  }),
  z.object({
    action: z.enum(["restriction", "suspension"]),
    rule: z.enum(CHARTER_RULES),
    statement: z.string().max(2000),
    durationDays: z.union([z.literal(7), z.literal(30)]),
  }),
]);

const catalogPrompt = z.object({
  id: z.uuid(),
  slug: z.string(),
  category: z.string(),
  textFr: z.string(),
  textEn: z.string(),
  active: z.boolean(),
});
const catalogInterest = z.object({
  id: z.uuid(),
  slug: z.string(),
  category: z.string(),
  labelFr: z.string(),
  labelEn: z.string(),
});
const slug = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  .max(60);

/**
 * Back-office (ADM-01 to ADM-03, ADM-05, ADM-06). Moderators and admins;
 * catalogue editing is reserved to admins. Every action is audited.
 */
export const adminContract = {
  me: oc.output(z.object({ role: z.enum(["moderator", "admin"]), pseudonym: z.string() })),
  overview: oc.output(
    z.object({
      pendingPhotos: z.int(),
      openReports: z.object({ p1: z.int(), p2: z.int(), p3: z.int() }),
      heldProfiles: z.int(),
    }),
  ),
  photoQueue: oc.input(page).output(z.object({ photos: z.array(queuedPhoto), total: z.int() })),
  moderatePhoto: oc
    .errors({ NOT_FOUND: { status: 404 } })
    .input(
      z.discriminatedUnion("decision", [
        z.object({ photoId: z.uuid(), decision: z.literal("approve") }),
        z.object({
          photoId: z.uuid(),
          decision: z.literal("reject"),
          reason: z.enum(PHOTO_REJECTION_REASONS),
        }),
      ]),
    )
    .output(z.object({ ok: z.literal(true) })),
  reports: oc
    .input(page.extend({ status: z.enum(REPORT_STATUSES).default("open") }))
    .output(z.object({ reports: z.array(reportSummary) })),
  /** Opening a report is logged: details are decrypted for the moderator. */
  report: oc
    .errors({ NOT_FOUND: { status: 404 } })
    .input(z.object({ id: z.uuid() }))
    .output(
      reportSummary.extend({
        contextRef: z.string().nullable(),
        details: z.string().nullable(),
        reporter: memberPseudonym.nullable(),
        reportedCard: memberCard.nullable(),
      }),
    ),
  decide: oc
    .errors({
      NOT_FOUND: { status: 404 },
      ALREADY_DECIDED: { status: 409 },
      STATEMENT_REQUIRED: { status: 422 },
    })
    .input(z.object({ reportId: z.uuid(), decision: decisionInput }))
    .output(z.object({ ok: z.literal(true) })),
  member: oc
    .errors({ NOT_FOUND: { status: 404 } })
    .input(z.object({ userId: z.uuid() }))
    .output(memberCard),
  /** Reveals the first name and address behind a pseudonym; the justification is logged. */
  revealIdentity: oc
    .errors({ NOT_FOUND: { status: 404 } })
    .input(z.object({ userId: z.uuid(), justification: z.string().min(10).max(500) }))
    .output(z.object({ firstName: z.string().nullable(), email: z.string() })),
  auditLog: oc.input(page).output(
    z.object({
      entries: z.array(
        z.object({
          id: z.uuid(),
          actor: z.string().nullable(),
          action: z.string(),
          targetType: z.string(),
          target: z.string().nullable(),
          metadata: z.record(z.string(), z.unknown()).nullable(),
          createdAt: z.iso.datetime(),
        }),
      ),
    }),
  ),
  catalog: oc.output(z.object({ prompts: z.array(catalogPrompt), interests: z.array(catalogInterest) })),
  savePrompt: oc
    .errors({ CONFLICT: { status: 409 } })
    .input(
      z.object({
        id: z.uuid().optional(),
        slug,
        category: z.string().min(1).max(40),
        textFr: z.string().min(3).max(120),
        textEn: z.string().min(3).max(120),
        active: z.boolean(),
      }),
    )
    .output(catalogPrompt),
  saveInterest: oc
    .errors({ CONFLICT: { status: 409 } })
    .input(
      z.object({
        id: z.uuid().optional(),
        slug,
        category: z.string().min(1).max(40),
        labelFr: z.string().min(2).max(60),
        labelEn: z.string().min(2).max(60),
      }),
    )
    .output(catalogInterest),
};
