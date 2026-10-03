import { MODES, PACT_PHASES } from "@epilove/core";
import { oc } from "@orpc/contract";
import { z } from "zod";
import { memberCard } from "./discovery";
import { compatibilityView, contentLocale } from "./questionnaire";

export const pactSeasonView = z.object({
  id: z.uuid(),
  name: z.string(),
  opensAt: z.iso.datetime(),
  closesAt: z.iso.datetime(),
  revealAt: z.iso.datetime(),
  phase: z.enum(PACT_PHASES),
});
export type PactSeasonView = z.infer<typeof pactSeasonView>;

export const pactCurrent = z.object({
  season: pactSeasonView.nullable(),
  /** Server clock, so the countdown does not depend on the device's clock. */
  serverNow: z.iso.datetime(),
  participation: z.object({ modes: z.array(z.enum(MODES)) }).nullable(),
  /** Number of participants (an aggregate, never a list). */
  participants: z.number().int(),
  /** Modes the member can join with (their profile's modes). */
  availableModes: z.array(z.enum(MODES)),
  questionnaire: z.object({ answered: z.number().int(), required: z.number().int() }),
});
export type PactCurrent = z.infer<typeof pactCurrent>;

export const pactSection = z.object({ section: z.string(), score: z.number().min(0).max(1).nullable() });

export const pactMatchView = z.object({
  mode: z.enum(MODES),
  /** Compatibility computed for the Pact, between 0 and 1. */
  score: z.number(),
  card: memberCard,
  /** Per-section compatibility for the radar chart. */
  sections: z.array(pactSection),
  compatibility: compatibilityView,
  matchId: z.uuid().nullable(),
});
export type PactMatchView = z.infer<typeof pactMatchView>;

export const pactContract = {
  /** The season shown in the Campus tab, the member's participation and the countdown's clock. */
  current: oc.output(pactCurrent),
  /** Joins the current season (or changes one's modes). Idempotent. */
  join: oc
    .input(z.object({ modes: z.array(z.enum(MODES)).min(1).max(MODES.length) }))
    .output(z.object({ modes: z.array(z.enum(MODES)) })),
  /** Leaves the current season while it is open. */
  leave: oc.output(z.object({ left: z.boolean() })),
  /** The member's Pact matches, once the season is revealed (empty: no match this time). */
  result: oc
    .input(z.object({ locale: contentLocale }))
    .output(z.object({ seasonId: z.uuid(), matches: z.array(pactMatchView) })),
  /** People connected to the reveal right now (Centrifugo presence), or null when unavailable. */
  liveCount: oc.output(z.object({ count: z.number().int().nullable() })),
};
