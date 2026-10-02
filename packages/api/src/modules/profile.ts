import type { OwnProfile, SongInfo } from "@epilove/contracts";
import { song as songSchema } from "@epilove/contracts";
import {
  ageOn,
  type Gender,
  graduationYearRange,
  type Intention,
  type Language,
  type Mode,
  normalizeFirstName,
  normalizePronouns,
} from "@epilove/core";
import type { Database } from "@epilove/db";
import { readPreferences } from "@epilove/db/repositories/accounts";
import {
  findOwnProfile,
  listActivePrompts,
  listInterestIds,
  listInterests,
  listPromptAnswers,
  type ProfilePatch,
  replaceInterests,
  replacePromptAnswers,
  updateProfile,
} from "@epilove/db/repositories/profiles";
import { ORPCError } from "@orpc/server";
import { refreshCompleteness } from "../lib/completeness";
import { checkedInterests, checkedProgram, checkedPromptAnswers, InvalidValue } from "../lib/profile-content";
import { withinQuota } from "../lib/quota";
import { campusToday } from "../lib/time";
import { os, requireViewer } from "../procedures";

async function loadOwnProfile(db: Database, userId: string, now: Date): Promise<OwnProfile> {
  const [profile, prefs, answers, interestIds, completeness] = await Promise.all([
    findOwnProfile(db, userId),
    readPreferences(db, userId),
    listPromptAnswers(db, userId),
    listInterestIds(db, userId),
    refreshCompleteness(db, userId),
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
    languages: profile.languages as Language[],
    intentions: profile.intentions as Intention[],
    modes: (prefs?.modes ?? []) as Mode[],
    promptAnswers: answers.map((answer) => ({ promptId: answer.promptId, text: answer.text ?? "" })),
    interestIds,
    anthem: parseAnthem(profile.anthem),
    completeness: { score: completeness.score, tips: [...completeness.tips] },
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
    return loadOwnProfile(context.database(), context.viewer.userId, context.services.now());
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
      return loadOwnProfile(db, userId, now);
    }),

  setPrompts: os.profile.setPrompts
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
          await replacePromptAnswers(tx, userId, await checkedPromptAnswers(tx, input.answers));
        }),
      );
      return loadOwnProfile(db, userId, context.services.now());
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
      return loadOwnProfile(db, userId, context.services.now());
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
      return loadOwnProfile(db, userId, context.services.now());
    }),
};
