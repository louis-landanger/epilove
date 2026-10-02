import { MODES } from "@epilove/core";
import { oc } from "@orpc/contract";
import { z } from "zod";
import { contentLocale } from "./questionnaire";

export const matchSummary = z.object({
  matchId: z.uuid(),
  mode: z.enum(MODES),
  createdAt: z.iso.datetime(),
  other: z.object({
    userId: z.uuid(),
    firstName: z.string(),
    photoUrl: z.string().nullable(),
    school: z.object({ slug: z.string(), name: z.string() }),
  }),
  /** Short preview of the last message, decrypted for the viewer only. */
  lastMessage: z
    .object({
      /** Text of a text message; empty for the other kinds, named by `kind`. */
      preview: z.string(),
      kind: z.string(),
      at: z.iso.datetime(),
      fromMe: z.boolean(),
    })
    .nullable(),
  unread: z.number().int(),
});
export type MatchSummary = z.infer<typeof matchSummary>;

export const matchesContract = {
  /** Active matches, new ones (no message yet) and conversations (CHAT-01, CHAT-02). */
  list: oc.input(z.object({ locale: contentLocale })).output(z.object({ matches: z.array(matchSummary) })),
  /** Ends a match for both members (CHAT-13). Idempotent. */
  unmatch: oc.input(z.object({ matchId: z.uuid() })).output(z.object({ ok: z.literal(true) })),
};
