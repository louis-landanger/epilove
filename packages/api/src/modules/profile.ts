import type { OwnProfile, SongInfo, VoiceAnswer } from "@atomes/contracts";
import { song as songSchema } from "@atomes/contracts";
import {
  ageOn,
  type Gender,
  graduationYearRange,
  type Intention,
  isValidPeaks,
  type Language,
  type Mode,
  normalizeFirstName,
  normalizePronouns,
  uuidv7,
  VOICE_MAX_BYTES,
  VOICE_MAX_DURATION_MS,
} from "@atomes/core";
import { type Database, enqueueJob } from "@atomes/db";
import { findAccount, readPreferences } from "@atomes/db/repositories/accounts";
import {
  advanceVoice,
  clearVoice,
  findOwnProfile,
  findPromptAnswer,
  listActivePrompts,
  listInterestIds,
  listInterests,
  listPromptAnswers,
  type ProfilePatch,
  type PromptAnswerRow,
  replaceInterests,
  replacePromptAnswers,
  startVoiceUpload,
  updateProfile,
} from "@atomes/db/repositories/profiles";
import { quarantineKey } from "@atomes/media";
import { ORPCError } from "@orpc/server";
import type { ApiServices } from "../context";
import { refreshCompleteness } from "../lib/completeness";
import { checkedInterests, checkedProgram, checkedPromptAnswers, InvalidValue } from "../lib/profile-content";
import { withinQuota } from "../lib/quota";
import { campusToday } from "../lib/time";
import { signVoiceUrl } from "../lib/voice-url";
import { os, requireViewer } from "../procedures";

async function loadOwnProfile(db: Database, userId: string, services: ApiServices): Promise<OwnProfile> {
  const now = services.now();
  const [profile, prefs, answers, interestIds, completeness, account] = await Promise.all([
    findOwnProfile(db, userId),
    readPreferences(db, userId),
    listPromptAnswers(db, userId),
    listInterestIds(db, userId),
    refreshCompleteness(db, userId),
    findAccount(db, userId),
  ]);
  if (!profile || !completeness) {
    throw new ORPCError("NO_PROFILE", { status: 409 });
  }
  const today = campusToday(now);
  return {
    firstName: profile.firstName,
    age: ageOn(profile.birthDate, today),
    gender: profile.gender as Gender,
    pronouns: profile.pronouns,
    program: profile.program,
    graduationYear: profile.graduationYear,
    graduationYears: graduationYearRange(today),
    schoolSlug: profile.schoolSlug,
    campusVerified: Boolean(account?.campusVerifiedAt),
    photoVerified: Boolean(account?.photoVerifiedAt),
    languages: profile.languages as Language[],
    intentions: profile.intentions as Intention[],
    modes: (prefs?.modes ?? []) as Mode[],
    promptAnswers: answers.map((answer) => ({
      promptId: answer.promptId,
      text: answer.text ?? "",
      voice: voiceOf(answer, services),
    })),
    interestIds,
    anthem: parseAnthem(profile.anthem),
    completeness: { score: completeness.score, tips: [...completeness.tips] },
  };
}

export const PROCESS_VOICE_TASK = "media/process-voice";

/** Deletes recordings that no answer points to any more; a failure leaves them to the purge. */
async function removeStored(services: ApiServices, keys: readonly string[]) {
  for (const key of keys) {
    await services
      .storage()
      .remove(key)
      .catch(() => console.error("[profile] a voice recording could not be deleted"));
  }
}

/** The voice answer as its owner sees it: a signed URL once ready. */
function voiceOf(answer: PromptAnswerRow, services: ApiServices): VoiceAnswer | null {
  if (!answer.voiceStage || answer.voiceDurationMs === null) {
    return null;
  }
  return {
    stage: answer.voiceStage,
    durationMs: answer.voiceDurationMs,
    peaks: answer.voicePeaks ?? [],
    url: answer.voiceStage === "ready" ? signVoiceUrl(services, answer.id) : null,
  };
}

function parseAnthem(value: unknown): SongInfo | null {
  const parsed = songSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/** Runs a profile write and turns validation failures into `INVALID_VALUE`. */
async function write<T>(
  errors: { INVALID_VALUE: (options: { data: { field: string } }) => Error },
  run: () => Promise<T>,
): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof InvalidValue) {
      throw errors.INVALID_VALUE({ data: { field: error.field } });
    }
    throw error;
  }
}

const EDITS_PER_HOUR = 120;

const editQuota = os.middleware(async ({ context, next }) => {
  const viewer = context.viewer;
  if (viewer && !(await withinQuota(context.services, "profile-edit", viewer.userId, EDITS_PER_HOUR, 3600))) {
    throw new ORPCError("TOO_MANY_REQUESTS");
  }
  return next();
});

/** The member's own profile (PRO-01 to PRO-05). */
export const profile = {
  catalog: os.profile.catalog.use(requireViewer).handler(async ({ context }) => {
    const db = context.database();
    const [prompts, interests] = await Promise.all([listActivePrompts(db), listInterests(db)]);
    return {
      prompts: prompts.map((row) => ({
        id: row.id,
        slug: row.slug,
        category: row.category,
        text: { fr: row.textFr, en: row.textEn },
      })),
      interests: interests.map((row) => ({
        id: row.id,
        slug: row.slug,
        category: row.category,
        label: { fr: row.labelFr, en: row.labelEn },
      })),
    };
  }),

  me: os.profile.me.use(requireViewer).handler(async ({ context }) => {
    return loadOwnProfile(context.database(), context.viewer.userId, context.services);
  }),

  update: os.profile.update
    .use(requireViewer)
    .use(editQuota)
    .handler(async ({ context, input, errors }) => {
      const { userId } = context.viewer;
      const db = context.database();
      const now = context.services.now();
      await write(errors, async () => {
        if (!(await findOwnProfile(db, userId))) {
          throw errors.NO_PROFILE();
        }
        const patch: ProfilePatch = {};
        if (input.firstName !== undefined) {
          const firstName = normalizeFirstName(input.firstName);
          if (!firstName) throw new InvalidValue("firstName");
          patch.firstName = firstName;
        }
        if (input.gender !== undefined) {
          patch.gender = input.gender;
        }
        if (input.pronouns !== undefined) {
          const pronouns = input.pronouns?.trim() ? normalizePronouns(input.pronouns) : null;
          if (input.pronouns?.trim() && !pronouns) throw new InvalidValue("pronouns");
          patch.pronouns = pronouns;
        }
        if (input.program !== undefined) {
          patch.program = checkedProgram(input.program);
        }
        if (input.graduationYear !== undefined) {
          const range = graduationYearRange(campusToday(now));
          if (input.graduationYear < range.min || input.graduationYear > range.max) {
            throw new InvalidValue("graduationYear");
          }
          patch.graduationYear = input.graduationYear;
        }
        if (input.languages !== undefined) {
          patch.languages = [...new Set(input.languages)];
        }
        if (input.intentions !== undefined) {
          patch.intentions = [...new Set(input.intentions)];
        }
        await updateProfile(db, userId, patch);
      });
      return loadOwnProfile(db, userId, context.services);
    }),

  setPrompts: os.profile.setPrompts
    .use(requireViewer)
    .use(editQuota)
    .handler(async ({ context, input, errors }) => {
      const { userId } = context.viewer;
      const db = context.database();
      const orphans = await write(errors, () =>
        db.transaction(async (tx) => {
          if (!(await findOwnProfile(tx, userId))) {
            throw errors.NO_PROFILE();
          }
          return replacePromptAnswers(tx, userId, await checkedPromptAnswers(tx, input.answers));
        }),
      );
      await removeStored(context.services, orphans);
      return loadOwnProfile(db, userId, context.services);
    }),

  searchSongs: os.profile.searchSongs.use(requireViewer).handler(async ({ context, input, errors }) => {
    if (!(await withinQuota(context.services, "song-search", context.viewer.userId, 60, 600))) {
      throw errors.RATE_LIMITED();
    }
    try {
      return { songs: await context.services.music().search(input.query) };
    } catch {
      throw errors.UNAVAILABLE();
    }
  }),

  setAnthem: os.profile.setAnthem
    .use(requireViewer)
    .use(editQuota)
    .handler(async ({ context, input, errors }) => {
      const { userId } = context.viewer;
      const db = context.database();
      if (!(await findOwnProfile(db, userId))) {
        throw errors.NO_PROFILE();
      }
      let anthem: SongInfo | null = null;
      if (input.trackId) {
        try {
          anthem = await context.services.music().lookup(input.trackId);
        } catch {
          throw errors.UNAVAILABLE();
        }
        if (!anthem) {
          throw errors.NOT_FOUND();
        }
      }
      await updateProfile(db, userId, { anthem: anthem ? { ...anthem } : null });
      return loadOwnProfile(db, userId, context.services);
    }),

  requestVoiceUpload: os.profile.requestVoiceUpload
    .use(requireViewer)
    .handler(async ({ context, input, errors }) => {
      const { userId } = context.viewer;
      if (!isValidPeaks(input.peaks)) {
        throw errors.INVALID_VALUE({ data: { field: "peaks" } });
      }
      if (!(await withinQuota(context.services, "voice-upload", userId, 20, 3600))) {
        throw errors.RATE_LIMITED();
      }
      const db = context.database();
      const answer = await findPromptAnswer(db, userId, input.promptId);
      if (!answer) {
        throw errors.NOT_FOUND();
      }
      const key = quarantineKey(userId, uuidv7());
      const previous = await startVoiceUpload(db, answer.id, {
        key,
        contentType: input.contentType,
        durationMs: Math.min(input.durationMs, VOICE_MAX_DURATION_MS),
        peaks: input.peaks,
      });
      await removeStored(context.services, previous ? [previous] : []);
      return context.services
        .storage()
        .presignUpload(key, input.contentType, context.services.now(), VOICE_MAX_BYTES);
    }),

  confirmVoiceUpload: os.profile.confirmVoiceUpload
    .use(requireViewer)
    .handler(async ({ context, input, errors }) => {
      const { userId } = context.viewer;
      const db = context.database();
      const answer = await findPromptAnswer(db, userId, input.promptId);
      if (!answer?.voiceStage) {
        throw errors.NOT_FOUND();
      }
      if (answer.voiceStage === "uploading") {
        if (!answer.voiceKey || !(await context.services.storage().head(answer.voiceKey))) {
          throw errors.UPLOAD_MISSING();
        }
        await db.transaction(async (tx) => {
          if (await advanceVoice(tx, answer.id, "uploading", "processing")) {
            await enqueueJob(
              tx,
              PROCESS_VOICE_TASK,
              { answerId: answer.id },
              { jobKey: `voice:${answer.id}` },
            );
          }
        });
      }
      return loadOwnProfile(db, userId, context.services);
    }),

  removeVoice: os.profile.removeVoice.use(requireViewer).handler(async ({ context, input, errors }) => {
    const { userId } = context.viewer;
    const db = context.database();
    const answer = await findPromptAnswer(db, userId, input.promptId);
    if (!answer) {
      throw errors.NOT_FOUND();
    }
    const key = await clearVoice(db, answer.id);
    await removeStored(context.services, key ? [key] : []);
    return loadOwnProfile(db, userId, context.services);
  }),

  setInterests: os.profile.setInterests
    .use(requireViewer)
    .use(editQuota)
    .handler(async ({ context, input, errors }) => {
      const { userId } = context.viewer;
      const db = context.database();
      await write(errors, () =>
        db.transaction(async (tx) => {
          if (!(await findOwnProfile(tx, userId))) {
            throw errors.NO_PROFILE();
          }
          await replaceInterests(tx, userId, await checkedInterests(tx, input.interestIds));
        }),
      );
      return loadOwnProfile(db, userId, context.services);
    }),
};
