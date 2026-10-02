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
  VOICE_CONTENT_TYPES,
  VOICE_MAX_BYTES,
  VOICE_MAX_DURATION_MS,
  VOICE_PEAK_COUNT,
} from "@epilove/core";
import { oc } from "@orpc/contract";
import { z } from "zod";

const localized = z.object({ fr: z.string(), en: z.string() });

export const catalog = z.object({
  prompts: z.array(z.object({ id: z.uuid(), slug: z.string(), category: z.string(), text: localized })),
  interests: z.array(z.object({ id: z.uuid(), slug: z.string(), category: z.string(), label: localized })),
});
export type Catalog = z.infer<typeof catalog>;

export const song = z.object({
  provider: z.literal("itunes"),
  trackId: z.string(),
  title: z.string(),
  artist: z.string(),
  artworkUrl: z.url(),
  previewUrl: z.url(),
  trackViewUrl: z.url(),
});
export type SongInfo = z.infer<typeof song>;

/** A voice answer (PRO-06); the answer's text is its transcript. */
export const voiceAnswer = z.object({
  stage: z.enum(["uploading", "processing", "ready", "failed"]),
  durationMs: z.int(),
  peaks: z.array(z.int().min(0).max(100)),
  /** Signed, expiring, same-origin URL; only once `ready`. */
  url: z.string().nullable(),
});
export type VoiceAnswer = z.infer<typeof voiceAnswer>;

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
  /** Forge ID confirmed the Lyon campus (ONB-11). */
  campusVerified: z.boolean(),
  /** Gesture selfie approved by a moderator (ONB-08). */
  photoVerified: z.boolean(),
  languages: z.array(z.enum(LANGUAGES)),
  intentions: z.array(z.enum(INTENTIONS)),
  modes: z.array(z.enum(MODES)),
  promptAnswers: z.array(z.object({ promptId: z.uuid(), text: z.string(), voice: voiceAnswer.nullable() })),
  interestIds: z.array(z.uuid()),
  /** "Mon son du moment" (PRO-07). */
  anthem: song.nullable(),
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
  /** Song search through the server (no direct call from browsers to Apple). */
  searchSongs: oc
    .errors({ RATE_LIMITED: { status: 429 }, UNAVAILABLE: { status: 503 } })
    .input(z.object({ query: z.string().min(2).max(100) }))
    .output(z.object({ songs: z.array(song) })),
  /** Picks a song by its catalogue id (looked up again on the server), or removes it with `null`. */
  setAnthem: oc
    .errors({ ...profileErrors, NOT_FOUND: { status: 404 }, UNAVAILABLE: { status: 503 } })
    .input(
      z.object({
        trackId: z
          .string()
          .regex(/^\d{1,15}$/)
          .nullable(),
      }),
    )
    .output(ownProfile),
  /** Attaches a recording (30 s max) to one of the member's answers: returns the presigned upload form. */
  requestVoiceUpload: oc
    .errors({ ...profileErrors, NOT_FOUND: { status: 404 }, RATE_LIMITED: { status: 429 } })
    .input(
      z.object({
        promptId: z.uuid(),
        contentType: z.enum(VOICE_CONTENT_TYPES),
        size: z.int().min(1).max(VOICE_MAX_BYTES),
        durationMs: z
          .int()
          .min(500)
          .max(VOICE_MAX_DURATION_MS + 500),
        peaks: z.array(z.int().min(0).max(100)).length(VOICE_PEAK_COUNT),
      }),
    )
    .output(
      z.object({
        url: z.url(),
        fields: z.record(z.string(), z.string()),
        maxBytes: z.int(),
        expiresAt: z.iso.datetime(),
      }),
    ),
  /** The browser upload succeeded: the recording is checked in the background. */
  confirmVoiceUpload: oc
    .errors({ ...profileErrors, NOT_FOUND: { status: 404 }, UPLOAD_MISSING: { status: 409 } })
    .input(z.object({ promptId: z.uuid() }))
    .output(ownProfile),
  removeVoice: oc
    .errors({ ...profileErrors, NOT_FOUND: { status: 404 } })
    .input(z.object({ promptId: z.uuid() }))
    .output(ownProfile),
  setInterests: oc
    .errors(profileErrors)
    .input(z.object({ interestIds: z.array(z.uuid()).min(MIN_INTERESTS).max(MAX_INTERESTS) }))
    .output(ownProfile),
};
