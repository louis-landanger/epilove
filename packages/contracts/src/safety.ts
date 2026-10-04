import { REPORT_CONTEXTS, REPORT_REASONS } from "@atomes/core";
import { oc } from "@orpc/contract";
import { z } from "zod";

export const memberRef = z.object({ userId: z.uuid() });

export const reportInput = z.object({
  reportedId: z.uuid(),
  context: z.enum(REPORT_CONTEXTS),
  /** Id of the reported photo, message or event, when relevant. */
  contextRef: z.string().max(100).optional(),
  reason: z.enum(REPORT_REASONS),
  details: z.string().max(2000).optional(),
  /** Offered and ticked by default in the report flow (docs/01-fonctionnalites.md). */
  alsoBlock: z.boolean().default(true),
});

/**
 * Safety actions callable from every surface (profile, chat, deck).
 * Implemented by stream A (packages/api/src/modules/safety.ts); stream B only calls them.
 */
export const safetyContract = {
  block: oc
    .errors({ NOT_FOUND: { status: 404 }, RATE_LIMITED: { status: 429 } })
    .input(memberRef)
    .output(z.object({ ok: z.literal(true) })),
  unblock: oc.input(memberRef).output(z.object({ ok: z.literal(true) })),
  /** Idempotent: the same report sent twice within a day returns the first one. */
  report: oc
    .errors({ NOT_FOUND: { status: 404 }, RATE_LIMITED: { status: 429 } })
    .input(reportInput)
    .output(z.object({ reportId: z.uuid() })),
  /** People the member blocked (settings), with the first name they had. */
  blocked: oc.output(
    z.object({
      people: z.array(
        z.object({ userId: z.uuid(), firstName: z.string().nullable(), blockedAt: z.iso.datetime() }),
      ),
    }),
  ),
};
