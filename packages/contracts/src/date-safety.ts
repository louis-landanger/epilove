import { CHECK_IN_ANSWERS } from "@epilove/core";
import { oc } from "@orpc/contract";
import { z } from "zod";

const UUIDV7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/** One link given to a trusted person (IRL-03). */
export const dateShareView = z.object({
  id: z.uuid(),
  /** Path of the public page (`/partage/<token>`); the client adds its origin. */
  path: z.string(),
  createdAt: z.iso.datetime(),
  expiresAt: z.iso.datetime(),
  state: z.enum(["active", "revoked", "expired"]),
});
export type DateShareView = z.infer<typeof dateShareView>;

/** The member's own kit for one date. */
export const dateKit = z.object({
  matchId: z.uuid(),
  messageId: z.uuid(),
  otherUserId: z.uuid(),
  otherFirstName: z.string(),
  place: z.string(),
  startsAt: z.iso.datetime(),
  checkInAt: z.iso.datetime(),
  checkIn: z.enum(CHECK_IN_ANSWERS).nullable(),
  shares: z.array(dateShareView),
});
export type DateKit = z.infer<typeof dateKit>;

/** What the trusted person sees, without signing in. */
export const sharedDate = z.object({
  sharerFirstName: z.string(),
  otherFirstName: z.string(),
  place: z.string(),
  startsAt: z.iso.datetime(),
  /** OpenStreetMap link when the place is a Spot. */
  mapUrl: z.string().nullable(),
  checkIn: z.object({ answer: z.enum(CHECK_IN_ANSWERS), at: z.iso.datetime() }).nullable(),
  expiresAt: z.iso.datetime(),
});
export type SharedDate = z.infer<typeof sharedDate>;

export const dateSafetyContract = {
  /** Creates a link for a trusted person to an accepted date (idempotent with `id`). */
  share: oc
    .input(z.object({ id: z.string().regex(UUIDV7), matchId: z.uuid(), messageId: z.uuid() }))
    .output(z.object({ kit: dateKit })),
  /** The kit of one date, from the date card (by message) or from the check-in notification (by share). */
  kit: oc
    .input(z.union([z.object({ shareId: z.uuid() }), z.object({ messageId: z.uuid() })]))
    .output(z.object({ kit: dateKit.nullable() })),
  /** "Tout s'est bien passé ?" — shown on every link of the date. */
  checkIn: oc
    .input(z.object({ shareId: z.uuid(), answer: z.enum(CHECK_IN_ANSWERS) }))
    .output(z.object({ kit: dateKit })),
  /** Stops a link at once. */
  revoke: oc.input(z.object({ shareId: z.uuid() })).output(z.object({ kit: dateKit })),
  /** Public: the trusted person's page. NOT_FOUND once expired or revoked. */
  shared: oc.input(z.object({ token: z.string().min(20).max(100) })).output(sharedDate),
};
