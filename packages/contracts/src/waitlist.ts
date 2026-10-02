import { LOCALES, SCHOOL_SLUGS } from "@epilove/core";
import { oc } from "@orpc/contract";
import { z } from "zod";

/**
 * Referral codes: 10 characters of lowercase Crockford base32 (no i, l, o, u),
 * 50 bits of randomness. Shared through `/?r=<code>` links (ONB-01).
 */
export const REFERRAL_CODE_ALPHABET = "0123456789abcdefghjkmnpqrstvwxyz";
export const REFERRAL_CODE_LENGTH = 10;
export const REFERRAL_CODE_PATTERN = /^[0-9a-hjkmnp-tv-z]{10}$/;

export const referralCode = z.string().regex(REFERRAL_CODE_PATTERN);

export const joinWaitlistInput = z.object({
  email: z.string().max(320),
  referralCode: referralCode.optional(),
  /** Language of the welcome email and of the referral link (PLT-04). */
  locale: z.enum(LOCALES).optional(),
});

/**
 * The answer never says whether the address was already on the list: joining
 * twice gets the same success, and the referral link only travels by email.
 * Only the address itself can be refused (format, or a school that is not eligible).
 */
export const joinWaitlistOutput = z.discriminatedUnion("ok", [
  z.object({ ok: z.literal(true) }),
  z.object({ ok: z.literal(false), reason: z.enum(["invalid_format", "domain_not_allowed"]) }),
]);

export const schoolRaceEntry = z.object({
  slug: z.enum(SCHOOL_SLUGS),
  name: z.string(),
  count: z.number().int().nonnegative(),
  /** Estimated headcount of the school in Lyon (to be confirmed with the schools). */
  headcount: z.number().int().positive(),
  /** count / headcount. */
  share: z.number().nonnegative(),
  rank: z.number().int().positive(),
});

export const waitlistStatsOutput = z.object({
  total: z.number().int().nonnegative(),
  goal: z.number().int().positive(),
  goalRatio: z.number().min(0).max(1),
  /** Ranked by share of headcount (docs/10-lancement.md, section 3). */
  schools: z.array(schoolRaceEntry),
  updatedAt: z.iso.datetime(),
});

export type JoinWaitlistInput = z.infer<typeof joinWaitlistInput>;
export type JoinWaitlistOutput = z.infer<typeof joinWaitlistOutput>;
export type SchoolRaceStanding = z.infer<typeof schoolRaceEntry>;
export type WaitlistStats = z.infer<typeof waitlistStatsOutput>;

/** Pre-launch waiting list and school race (ONB-01). Public: no session needed. */
export const waitlistContract = {
  join: oc.input(joinWaitlistInput).output(joinWaitlistOutput),
  stats: oc.output(waitlistStatsOutput),
};
