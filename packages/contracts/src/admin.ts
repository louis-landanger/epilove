import {
  ACCOUNT_STATUSES,
  CHARTER_RULES,
  REPORT_CONTEXTS,
  REPORT_PRIORITIES,
  REPORT_REASONS,
  SANCTIONS,
  VERIFICATION_GESTURES,
  VERIFICATION_REJECTIONS,
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

const hoursOrNull = z.number().nullable();

/** Aggregated indicators only (ADM-09): no field identifies a member. */
export const adminDashboard = z.object({
  generatedAt: z.iso.datetime(),
  periodDays: z.int(),
  members: z.object({
    byStatus: z.partialRecord(z.enum(ACCOUNT_STATUSES), z.int()),
    signupsByDay: z.array(z.object({ day: z.iso.date(), count: z.int() })),
    activation: z.object({ members: z.int(), complete: z.int() }),
    activeLast7Days: z.int(),
    retention: z.object({ cohort: z.int(), retained: z.int() }),
    schools: z.array(
      z.object({ slug: z.string(), members: z.int(), waitlist: z.int(), headcount: z.int().nullable() }),
    ),
  }),
  moderation: z.object({
    reports: z.array(
      z.object({
        priority: z.enum(REPORT_PRIORITIES),
        targetHours: z.int(),
        open: z.int(),
        oldestOpenHours: hoursOrNull,
        handled: z.int(),
        within24h: z.int(),
        withinTarget: z.int(),
        medianHours: hoursOrNull,
        p90Hours: hoursOrNull,
      }),
    ),
    photos: z.object({
      pending: z.int(),
      oldestPendingHours: hoursOrNull,
      reviewed: z.int(),
      rejected: z.int(),
      medianReviewHours: hoursOrNull,
    }),
    appeals: z.object({
      pending: z.int(),
      oldestPendingHours: hoursOrNull,
      decided: z.int(),
      overturned: z.int(),
    }),
    sanctions: z.partialRecord(z.enum(SANCTIONS), z.int()),
  }),
  meeting: z.object({
    likes: z.int(),
    matches: z.int(),
    matchesWithConversation: z.int(),
    crossSchoolMatches: z.int(),
    reciprocalConversationsThisWeek: z.int(),
  }),
  health: z.object({
    version: z.string(),
    jobs: z.object({
      pending: z.int(),
      running: z.int(),
      failed: z.int(),
      oldestWaitingMinutes: hoursOrNull,
    }),
    photos: z.object({ processing: z.int(), stuck: z.int(), failedToday: z.int() }),
    exports: z.object({ pending: z.int(), failed: z.int() }),
    databaseBytes: z.int(),
  }),
});
export type AdminDashboard = z.infer<typeof adminDashboard>;

/**
 * Back-office (ADM-01 to ADM-03, ADM-05, ADM-06, ADM-09). Moderators and admins;
 * catalogue editing is reserved to admins. Every action is audited.
 */
export const adminContract = {
  me: oc.output(
    z.object({
      role: z.enum(["moderator", "admin"]),
      pseudonym: z.string(),
      /** Staff see member photos with their own watermark too (SAF-12). */
      watermark: z.string(),
    }),
  ),
  /** Whose screen a leaked capture comes from, by the code tiled over it (SAF-12). Logged. */
  findWatermark: oc
    .errors({ INVALID_VALUE: { status: 422 } })
    .input(z.object({ code: z.string().min(4).max(20), justification: z.string().min(10).max(500) }))
    .output(z.object({ member: memberPseudonym.nullable() })),
  overview: oc.output(
    z.object({
      pendingPhotos: z.int(),
      pendingVerifications: z.int(),
      openReports: z.object({ p1: z.int(), p2: z.int(), p3: z.int() }),
      heldProfiles: z.int(),
    }),
  ),
  /** Product, moderation and technical indicators over a period (ADM-09). */
  dashboard: oc
    .input(
      z
        .object({ days: z.union([z.literal(7), z.literal(30), z.literal(90)]).default(30) })
        .default({ days: 30 }),
    )
    .output(adminDashboard),
  /** Gesture selfies waiting for review, oldest first, with the photos to compare with (ONB-08). */
  verificationQueue: oc.output(
    z.object({
      total: z.int(),
      verifications: z.array(
        z.object({
          id: z.uuid(),
          member: memberPseudonym,
          gesture: z.enum(VERIFICATION_GESTURES),
          selfieUrl: z.string(),
          photos: z.array(z.object({ id: z.uuid(), url: z.string() })),
          submittedAt: z.iso.datetime(),
        }),
      ),
    }),
  ),
  /** Approves (badge) or rejects a selfie; it is deleted either way. */
  reviewVerification: oc
    .errors({ NOT_FOUND: { status: 404 } })
    .input(
      z.discriminatedUnion("decision", [
        z.object({ id: z.uuid(), decision: z.literal("approve") }),
        z.object({ id: z.uuid(), decision: z.literal("reject"), reason: z.enum(VERIFICATION_REJECTIONS) }),
      ]),
    )
    .output(z.object({ ok: z.literal(true) })),
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
  /** Pending appeals (ADM-04), oldest first. */
  appeals: oc.output(
    z.object({
      appeals: z.array(
        z.object({
          id: z.uuid(),
          createdAt: z.iso.datetime(),
          action: z.enum(SANCTIONS),
          rule: z.string(),
          member: memberPseudonym.nullable(),
        }),
      ),
    }),
  ),
  appeal: oc
    .errors({ NOT_FOUND: { status: 404 } })
    .input(z.object({ id: z.uuid() }))
    .output(
      z.object({
        id: z.uuid(),
        text: z.string(),
        status: z.enum(["pending", "upheld", "overturned"]),
        createdAt: z.iso.datetime(),
        decision: z.object({
          action: z.enum(SANCTIONS),
          rule: z.string(),
          statement: z.string(),
          createdAt: z.iso.datetime(),
          decidedBy: z.string().nullable(),
          reportId: z.uuid().nullable(),
        }),
        /** False when the viewer took the original decision: someone else must review it. */
        canReview: z.boolean(),
        memberCard: memberCard.nullable(),
      }),
    ),
  decideAppeal: oc
    .errors({
      NOT_FOUND: { status: 404 },
      CONFLICT_OF_INTEREST: { status: 403 },
      ALREADY_DECIDED: { status: 409 },
    })
    .input(
      z.object({
        id: z.uuid(),
        outcome: z.enum(["upheld", "overturned"]),
        statement: z.string().min(20).max(2000),
      }),
    )
    .output(z.object({ ok: z.literal(true) })),
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
