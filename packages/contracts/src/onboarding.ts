import {
  GENDERS,
  INTENTIONS,
  MAX_INTERESTS,
  MIN_INTERESTS,
  MODES,
  ONBOARDING_STEPS,
  PROMPT_ANSWER_COUNT,
} from "@epilove/core";
import { oc } from "@orpc/contract";
import { z } from "zod";

export const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const charterStep = z.object({ step: z.literal("charter"), accepted: z.literal(true) });
const nameStep = z.object({ step: z.literal("name"), firstName: z.string().max(80) });
const birthStep = z.object({ step: z.literal("birth"), birthDate: isoDate });
const genderStep = z.object({
  step: z.literal("gender"),
  gender: z.enum(GENDERS),
  pronouns: z.string().max(60).nullable(),
});
const seekingStep = z.object({
  step: z.literal("seeking"),
  modes: z.array(z.enum(MODES)).min(1).max(MODES.length),
  intentions: z.array(z.enum(INTENTIONS)).max(INTENTIONS.length),
});
const audienceStep = z.object({
  step: z.literal("audience"),
  ageMin: z.int().min(18).max(99),
  ageMax: z.int().min(18).max(99),
  /** Separate, explicit consent to processing sensitive data (ONB-05). Never pre-ticked. */
  sensitiveConsent: z.boolean(),
  /** Genders sought in Love mode. Sensitive data: ignored without consent. */
  interestedIn: z.array(z.enum(GENDERS)).max(GENDERS.length),
});
const promptsStep = z.object({
  step: z.literal("prompts"),
  answers: z.array(z.object({ promptId: z.uuid(), text: z.string().max(400) })).length(PROMPT_ANSWER_COUNT),
});
const interestsStep = z.object({
  step: z.literal("interests"),
  interestIds: z.array(z.uuid()).min(MIN_INTERESTS).max(MAX_INTERESTS),
});
const campusStep = z.object({
  step: z.literal("campus"),
  graduationYear: z.int(),
  program: z.string().max(120).nullable(),
  /** "I study on the Lyon campus" (ONB-12). */
  onCampus: z.literal(true),
  /** "I am a student, not a staff member" (ONB-12, terms of use). */
  student: z.literal(true),
});

export const onboardingSaveInput = z.discriminatedUnion("step", [
  charterStep,
  nameStep,
  birthStep,
  genderStep,
  seekingStep,
  audienceStep,
  promptsStep,
  interestsStep,
  campusStep,
]);
export type OnboardingSaveInput = z.infer<typeof onboardingSaveInput>;

export const onboardingState = z.object({
  /** Next step to show, `null` when the account can be activated. */
  step: z.enum(ONBOARDING_STEPS).nullable(),
  missing: z.array(z.enum(ONBOARDING_STEPS)),
  schoolSlug: z.string(),
  /** Today in the campus time zone, for date inputs. */
  today: isoDate,
  graduationYears: z.object({ min: z.int(), max: z.int() }),
  answers: z.object({
    charterAccepted: z.boolean(),
    firstName: z.string().nullable(),
    birthDate: isoDate.nullable(),
    gender: z.enum(GENDERS).nullable(),
    pronouns: z.string().nullable(),
    modes: z.array(z.enum(MODES)),
    intentions: z.array(z.enum(INTENTIONS)),
    sensitiveConsent: z.boolean(),
    interestedIn: z.array(z.enum(GENDERS)),
    ageMin: z.int().nullable(),
    ageMax: z.int().nullable(),
    promptAnswers: z.array(z.object({ promptId: z.uuid(), text: z.string() })),
    interestIds: z.array(z.uuid()),
    graduationYear: z.int().nullable(),
    program: z.string().nullable(),
    campusDeclared: z.boolean(),
  }),
  /** Uploaded photos that count towards the minimum. */
  photos: z.int(),
});
export type OnboardingState = z.infer<typeof onboardingState>;

const onboardingErrors = {
  /** The account is no longer in onboarding. */
  NOT_ONBOARDING: { status: 409 },
  /** A value failed validation; `field` names it (for the form). */
  INVALID_VALUE: { status: 422, data: z.object({ field: z.string() }) },
  /** Declared birth date under 18: the account has been deleted (ONB-04). */
  UNDERAGE: { status: 403 },
};

/** Onboarding (ONB-04 to ONB-06, ONB-12): saved at every step, resumable. */
export const onboardingContract = {
  state: oc.errors(onboardingErrors).output(onboardingState),
  save: oc.errors(onboardingErrors).input(onboardingSaveInput).output(onboardingState),
  /** Creates the profile and activates the account once every step is done. */
  complete: oc
    .errors({
      ...onboardingErrors,
      INCOMPLETE: { status: 409, data: z.object({ missing: z.array(z.enum(ONBOARDING_STEPS)) }) },
    })
    .output(z.object({ ok: z.literal(true) })),
};
