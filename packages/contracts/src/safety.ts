import { REPORT_CONTEXTS, REPORT_REASONS } from "@epilove/core";
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
  block: oc.input(memberRef).output(z.object({ ok: z.literal(true) })),
  unblock: oc.input(memberRef).output(z.object({ ok: z.literal(true) })),
  report: oc.input(reportInput).output(z.object({ reportId: z.uuid() })),
};
