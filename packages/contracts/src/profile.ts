import {
  COMPLETENESS_TIPS,
  GENDERS,
  INTENTIONS,
  LANGUAGES,
  MAX_INTERESTS,
  MAX_LANGUAGES,
  MIN_INTERESTS,
  MODES,
  PROMPT_ANSWER_COUNT,
} from "@epilove/core";
import { oc } from "@orpc/contract";
import { z } from "zod";

const localized = z.object({ fr: z.string(), en: z.string() });

export const catalog = z.object({
  prompts: z.array(z.object({ id: z.uuid(), slug: z.string(), category: z.string(), text: localized })),
  interests: z.array(z.object({ id: z.uuid(), slug: z.string(), category: z.string(), label: localized })),
});
export type Catalog = z.infer<typeof catalog>;

/** The member's own profile, as they edit it. */
export const ownProfile = z.object({
  firstName: z.string(),
  age: z.int(),
  gender: z.enum(GENDERS),
  pronouns: z.string().nullable(),
  program: z.string().nullable(),
  graduationYear: z.int(),
  graduationYears: z.object({ min: z.int(), max: z.int() }),
  schoolSlug: z.string(),
  languages: z.array(z.enum(LANGUAGES)),
  intentions: z.array(z.enum(INTENTIONS)),
  modes: z.array(z.enum(MODES)),
  promptAnswers: z.array(z.object({ promptId: z.uuid(), text: z.string() })),
  interestIds: z.array(z.uuid()),
  completeness: z.object({ score: z.int().min(0).max(100), tips: z.array(z.enum(COMPLETENESS_TIPS)) }),
});
export type OwnProfile = z.infer<typeof ownProfile>;

const profileErrors = {
  /** The member has no profile yet (onboarding not finished). */
  NO_PROFILE: { status: 409 },
  INVALID_VALUE: { status: 422, data: z.object({ field: z.string() }) },
};

export const profileUpdateInput = z.object({
  firstName: z.string().max(80).optional(),
  gender: z.enum(GENDERS).optional(),
  pronouns: z.string().max(60).nullable().optional(),
  program: z.string().max(120).nullable().optional(),
  graduationYear: z.int().optional(),
  languages: z.array(z.enum(LANGUAGES)).max(MAX_LANGUAGES).optional(),
  intentions: z.array(z.enum(INTENTIONS)).max(INTENTIONS.length).optional(),
});

/** The member's own profile (PRO-01 to PRO-05). The date of birth cannot be changed. */
export const profileContract = {
  /** Prompt and interest catalogues, in both languages. */
  catalog: oc.output(catalog),
  me: oc.errors(profileErrors).output(ownProfile),
  update: oc.errors(profileErrors).input(profileUpdateInput).output(ownProfile),
  setPrompts: oc
    .errors(profileErrors)
    .input(
      z.object({
        answers: z
          .array(z.object({ promptId: z.uuid(), text: z.string().max(400) }))
          .length(PROMPT_ANSWER_COUNT),
      }),
    )
    .output(ownProfile),
  setInterests: oc
    .errors(profileErrors)
    .input(z.object({ interestIds: z.array(z.uuid()).min(MIN_INTERESTS).max(MAX_INTERESTS) }))
    .output(ownProfile),
};
