import { ACCOUNT_STATUSES } from "@epilove/core";
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
  delete: oc
    .errors({ NOT_ALLOWED: { status: 409 } })
    .input(z.object({ confirm: z.literal(true) }))
    .output(z.object({ ok: z.literal(true) })),
};
