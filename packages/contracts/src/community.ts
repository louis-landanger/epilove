import { oc } from "@orpc/contract";
import { z } from "zod";
import { contentLocale } from "./questionnaire";

/** An aggregate of at least ten people, in whole percentages. */
export const distribution = z.object({
  total: z.number().int(),
  shares: z.array(z.object({ option: z.string(), percent: z.number().int() })),
});
export type DistributionView = z.infer<typeof distribution>;

/** The question of the week (COM-01). */
export const weeklyView = z.object({
  week: z.string(),
  endsAt: z.iso.datetime(),
  question: z
    .object({
      id: z.uuid(),
      text: z.string(),
      options: z.array(z.object({ value: z.string(), label: z.string() })),
    })
    .nullable(),
  myAnswer: z.string().nullable(),
  /** Shown once the viewer answered. Schools below ten answers are left out. */
  results: z
    .object({
      overall: distribution.nullable(),
      bySchool: z.array(distribution.extend({ schoolSlug: z.string() })),
    })
    .nullable(),
});
export type WeeklyView = z.infer<typeof weeklyView>;

/** Cross-school index (COM-02): pairs of schools with ten new matches or more. */
export const crossSchoolView = z.object({
  since: z.iso.datetime(),
  pairs: z.array(z.object({ a: z.string(), b: z.string(), count: z.number().int() })),
});
export type CrossSchoolView = z.infer<typeof crossSchoolView>;

/** Pact statistics (PAC-04), after a season's reveal. */
export const pactStatsView = z.object({
  season: z.object({ name: z.string() }).nullable(),
  participants: z.number().int().nullable(),
  matches: z.number().int().nullable(),
  crossSchoolPercent: z.number().int().nullable(),
  facts: z.array(z.object({ question: z.string(), option: z.string(), percent: z.number().int() })),
});
export type PactStatsView = z.infer<typeof pactStatsView>;

/** Wrapped (COM-03): the member's own year, counts only. */
export const wrappedView = z.object({
  label: z.string(),
  since: z.iso.datetime(),
  matches: z.number().int(),
  messages: z.number().int(),
  conversations: z.number().int(),
  likes: z.number().int(),
  events: z.number().int(),
  pacts: z.number().int(),
  favoriteReaction: z.string().nullable(),
  peakHour: z.number().int().nullable(),
});
export type WrappedView = z.infer<typeof wrappedView>;

export const communityContract = {
  weekly: oc.input(z.object({ locale: contentLocale })).output(weeklyView),
  answerWeekly: oc
    .input(z.object({ questionId: z.uuid(), option: z.string().min(1).max(40), locale: contentLocale }))
    .output(weeklyView),
  crossSchool: oc.output(crossSchoolView),
  pactStats: oc.input(z.object({ locale: contentLocale })).output(pactStatsView),
  /** The viewer's own Wrapped for the current academic year. */
  wrapped: oc.output(wrappedView),
};
