import { ACCOUNT_STATUSES, SANCTIONS } from "@epilove/core";
import { oc } from "@orpc/contract";
import { z } from "zod";

export const accountSummary = z.object({
  email: z.string(),
  schoolSlug: z.string(),
  status: z.enum(ACCOUNT_STATUSES),
});

/** The member's account: pause (SAF-05) and self-service deletion (SAF-14). */
export const accountContract = {
  summary: oc.output(accountSummary),
  /** The profile leaves discovery; conversations stay available. */
  pause: oc.errors({ NOT_ALLOWED: { status: 409 } }).output(accountSummary),
  resume: oc.errors({ NOT_ALLOWED: { status: 409 } }).output(accountSummary),
  /**
   * Immediate and final: the account disappears at once, sessions end, and
   * content is erased within 30 days.
   */
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
  delete: oc
    .errors({ NOT_ALLOWED: { status: 409 } })
    .input(z.object({ confirm: z.literal(true) }))
    .output(z.object({ ok: z.literal(true) })),
};
