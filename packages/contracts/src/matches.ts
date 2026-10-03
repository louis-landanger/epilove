import { AVAILABILITY_ACTIVITIES, AVAILABILITY_AREAS, MODES } from "@epilove/core";
import { oc } from "@orpc/contract";
import { z } from "zod";
import { contentLocale } from "./questionnaire";

/** "Dispo" status (IRL-05): what, where, until when. */
export const availabilityView = z.object({
  activity: z.enum(AVAILABILITY_ACTIVITIES),
  area: z.enum(AVAILABILITY_AREAS),
  until: z.iso.datetime(),
});
export type AvailabilityView = z.infer<typeof availabilityView>;

export const matchSummary = z.object({
  matchId: z.uuid(),
  mode: z.enum(MODES),
  createdAt: z.iso.datetime(),
  other: z.object({
    userId: z.uuid(),
    firstName: z.string(),
    photoUrl: z.string().nullable(),
    school: z.object({ slug: z.string(), name: z.string() }),
    /** Their "Dispo" status, while it lasts. */
    available: availabilityView.nullable(),
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
  /** One's own "Dispo" status (IRL-05). */
  availability: oc.output(z.object({ availability: availabilityView.nullable() })),
  /** Sets it (15 minutes to 12 hours) or clears it with null. */
  setAvailability: oc
    .input(z.object({ availability: availabilityView.nullable() }))
    .output(z.object({ availability: availabilityView.nullable() })),
};
