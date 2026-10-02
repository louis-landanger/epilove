import { ACCOUNT_STATUSES, LOCALES, SANCTIONS } from "@epilove/core";
import { oc } from "@orpc/contract";
import { z } from "zod";

export const accountSummary = z.object({
  email: z.string(),
  schoolSlug: z.string(),
  status: z.enum(ACCOUNT_STATUSES),
  /** End of a scheduled pause (SAF-08), `null` for an open-ended pause. */
  pausedUntil: z.iso.datetime().nullable(),
  /** Interface and email language (PLT-04). */
  locale: z.enum(LOCALES),
});

/** The member's account: pause (SAF-05) and self-service deletion (SAF-14). */
export const accountContract = {
  summary: oc.output(accountSummary),
  /** The profile leaves discovery; conversations stay available. */
  pause: oc
    .errors({ NOT_ALLOWED: { status: 409 }, INVALID_VALUE: { status: 422 } })
    .input(z.object({ until: z.iso.datetime().nullable().default(null) }).default({ until: null }))
    .output(accountSummary),
  resume: oc.errors({ NOT_ALLOWED: { status: 409 } }).output(accountSummary),
  /** Language of the interface and of the emails, kept across devices (PLT-04). */
  setLocale: oc.input(z.object({ locale: z.enum(LOCALES) })).output(accountSummary),
  /** Decisions taken about the member, with their statement of reasons (DSA art. 17). */
  decisions: oc.output(
    z.object({
      decisions: z.array(
        z.object({
          id: z.uuid(),
          action: z.enum(SANCTIONS),
          rule: z.string(),
          statement: z.string(),
          createdAt: z.iso.datetime(),
          expiresAt: z.iso.datetime().nullable(),
          appeal: z.enum(["pending", "upheld", "overturned"]).nullable(),
          canAppeal: z.boolean(),
        }),
      ),
    }),
  ),
  /** Contests a decision once, within six months; reviewed by another moderator (ADM-04). */
  appeal: oc
    .errors({ NOT_ALLOWED: { status: 409 }, NOT_FOUND: { status: 404 } })
    .input(z.object({ decisionId: z.uuid(), text: z.string().min(20).max(2000) }))
    .output(z.object({ ok: z.literal(true) })),
  /** Asks for a zip of the member's data (SAF-14); built in the background, emailed when ready. */
  requestExport: oc.errors({ RATE_LIMITED: { status: 429 } }).output(z.object({ exportId: z.uuid() })),
  exports: oc.output(
    z.object({
      exports: z.array(
        z.object({
          id: z.uuid(),
          status: z.enum(["pending", "ready", "failed"]),
          createdAt: z.iso.datetime(),
          expiresAt: z.iso.datetime().nullable(),
          /** Same-origin download path, only while the export is ready and not expired. */
          downloadPath: z.string().nullable(),
        }),
      ),
    }),
  ),
  /**
   * Immediate and final: the account disappears at once, sessions end, and
   * content is erased within 30 days.
   */
  delete: oc
    .errors({ NOT_ALLOWED: { status: 409 } })
    .input(z.object({ confirm: z.literal(true) }))
    .output(z.object({ ok: z.literal(true) })),
};
