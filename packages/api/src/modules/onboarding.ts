import type { OnboardingSaveInput, OnboardingState } from "@epilove/contracts";
import {
  adulthoodDate,
  checkBirthDate,
  effectiveModes,
  type Gender,
  graduationYearRange,
  isValidAgeRange,
  LEGAL_VERSIONS,
  type Mode,
  missingSteps,
  nextReverificationDue,
  normalizeFirstName,
  normalizePronouns,
  type OnboardingProgress,
  profileCompleteness,
} from "@epilove/core";
import type { Database } from "@epilove/db";
import {
  activateAccount,
  activeConsents,
  deleteOnboardingDraft,
  deleteUnderageAccount,
  findAccount,
  grantConsent,
  mergeOnboardingDraft,
  readOnboardingDraft,
  readPreferences,
  upsertPreferences,
  withdrawConsent,
} from "@epilove/db/repositories/accounts";
import {
  countUsablePhotos,
  listInterestIds,
  listPromptAnswers,
  replaceInterests,
  replacePromptAnswers,
} from "@epilove/db/repositories/profiles";
import { ORPCError } from "@orpc/server";
import { checkedInterests, checkedProgram, checkedPromptAnswers, InvalidValue } from "../lib/profile-content";
import { withinQuota } from "../lib/quota";
import { campusToday } from "../lib/time";
import { os, requireViewer } from "../procedures";

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

async function loadProgress(db: Database | Tx, userId: string) {
  const [account, draft, prefs, consents, photos, answers, interestIds] = await Promise.all([
    findAccount(db, userId),
    readOnboardingDraft(db, userId),
    readPreferences(db, userId),
    activeConsents(db, userId),
    countUsablePhotos(db, userId),
    listPromptAnswers(db, userId),
    listInterestIds(db, userId),
  ]);
  if (!account) {
    throw new ORPCError("UNAUTHORIZED");
  }
  const progress: OnboardingProgress = {
    charterAccepted: Boolean(draft.charterAcceptedAt) && consents.has("terms"),
    firstName: draft.firstName ?? null,
    birthDate: draft.birthDate ?? null,
    gender: draft.gender ?? null,
    modes: prefs?.modes ?? [],
    sensitiveConsent: consents.has("sensitive_data"),
    interestedIn: prefs?.interestedIn ?? [],
    audienceSet: Boolean(draft.audienceSetAt),
    photos,
    promptAnswers: answers.length,
    interests: interestIds.length,
    graduationYear: draft.graduationYear ?? null,
    campusDeclared: Boolean(draft.campusDeclaredAt),
  };
  return { account, draft, prefs, progress, answers, interestIds };
}

function toState(loaded: Awaited<ReturnType<typeof loadProgress>>, now: Date): OnboardingState {
  const { account, draft, prefs, progress, answers, interestIds } = loaded;
  const today = campusToday(now);
  const missing = missingSteps(progress, today);
  return {
    step: missing[0] ?? null,
    missing,
    schoolSlug: account.schoolSlug,
    today,
    graduationYears: graduationYearRange(today),
    answers: {
      charterAccepted: progress.charterAccepted,
      firstName: progress.firstName,
      birthDate: progress.birthDate,
      gender: progress.gender,
      pronouns: draft.pronouns ?? null,
      modes: [...progress.modes],
      intentions: (draft.intentions ?? []) as OnboardingState["answers"]["intentions"],
      sensitiveConsent: progress.sensitiveConsent,
      interestedIn: [...progress.interestedIn],
      ageMin: progress.audienceSet ? (prefs?.ageMin ?? null) : null,
      ageMax: progress.audienceSet ? (prefs?.ageMax ?? null) : null,
      promptAnswers: answers.map((answer) => ({ promptId: answer.promptId, text: answer.text ?? "" })),
      interestIds,
      graduationYear: progress.graduationYear,
      program: draft.program ?? null,
      campusDeclared: progress.campusDeclared,
    },
    photos: progress.photos,
  };
}

const requireOnboarding = os.middleware(async ({ context, next }) => {
  const viewer = context.viewer;
  if (!viewer) {
    throw new ORPCError("UNAUTHORIZED");
  }
  const account = await findAccount(context.database(), viewer.userId);
  if (!account) {
    throw new ORPCError("UNAUTHORIZED");
  }
  if (account.status !== "onboarding") {
    throw new ORPCError("NOT_ONBOARDING", { status: 409 });
  }
  return next({ context: { account } });
});

async function saveStep(tx: Tx, userId: string, input: OnboardingSaveInput, now: Date) {
  const today = campusToday(now);
  switch (input.step) {
    case "charter": {
      await grantConsent(tx, userId, "terms", LEGAL_VERSIONS.terms);
      await grantConsent(tx, userId, "privacy", LEGAL_VERSIONS.privacy);
      await mergeOnboardingDraft(tx, userId, { charterAcceptedAt: now.toISOString() });
      return;
    }
    case "name": {
      const firstName = normalizeFirstName(input.firstName);
      if (!firstName) throw new InvalidValue("firstName");
      await mergeOnboardingDraft(tx, userId, { firstName });
      return;
    }
    case "birth": {
      // The underage case is handled by the caller, outside this transaction.
      const check = checkBirthDate(input.birthDate, today);
      if (!check.ok) throw new InvalidValue("birthDate");
      await mergeOnboardingDraft(tx, userId, { birthDate: input.birthDate });
      return;
    }
    case "gender": {
      const pronouns = input.pronouns?.trim() ? normalizePronouns(input.pronouns) : null;
      if (input.pronouns?.trim() && !pronouns) throw new InvalidValue("pronouns");
      await mergeOnboardingDraft(tx, userId, { gender: input.gender, pronouns });
      return;
    }
    case "seeking": {
      const modes = [...new Set(input.modes)] as Mode[];
      // Leaving Love mode erases the genders sought: no sensitive data kept without purpose.
      await upsertPreferences(tx, userId, { modes, ...(modes.includes("love") ? {} : { interestedIn: [] }) });
      await mergeOnboardingDraft(tx, userId, { intentions: [...new Set(input.intentions)] });
      return;
    }
    case "audience": {
      if (!isValidAgeRange(input.ageMin, input.ageMax)) throw new InvalidValue("ageRange");
      const prefs = await readPreferences(tx, userId);
      const modes = prefs?.modes ?? [];
      if (modes.length === 0) throw new InvalidValue("modes");
      let interestedIn: Gender[] = [];
      let nextModes: Mode[] = [...modes];
      if (modes.includes("love")) {
        if (input.sensitiveConsent) {
          interestedIn = [...new Set(input.interestedIn)];
          if (interestedIn.length === 0) throw new InvalidValue("interestedIn");
          await grantConsent(tx, userId, "sensitive_data", LEGAL_VERSIONS.sensitive_data);
        } else {
          await withdrawConsent(tx, userId, "sensitive_data");
          nextModes = effectiveModes(modes, false);
        }
      }
      await upsertPreferences(tx, userId, {
        modes: nextModes,
        interestedIn,
        ageMin: input.ageMin,
        ageMax: input.ageMax,
      });
      await mergeOnboardingDraft(tx, userId, { audienceSetAt: now.toISOString() });
      return;
    }
    case "prompts": {
      await replacePromptAnswers(tx, userId, await checkedPromptAnswers(tx, input.answers));
      return;
    }
    case "interests": {
      await replaceInterests(tx, userId, await checkedInterests(tx, input.interestIds));
      return;
    }
    case "campus": {
      const range = graduationYearRange(today);
      if (input.graduationYear < range.min || input.graduationYear > range.max) {
        throw new InvalidValue("graduationYear");
      }
      const program = checkedProgram(input.program);
      await mergeOnboardingDraft(tx, userId, {
        graduationYear: input.graduationYear,
        program,
        campusDeclaredAt: now.toISOString(),
      });
      return;
    }
  }
}

/** Onboarding (ONB-04 to ONB-06, ONB-12). Every procedure requires an account still in onboarding. */
export const onboarding = {
  state: os.onboarding.state
    .use(requireViewer)
    .use(requireOnboarding)
    .handler(async ({ context }) => {
      const now = context.services.now();
      return toState(await loadProgress(context.database(), context.viewer.userId), now);
    }),

  save: os.onboarding.save
    .use(requireViewer)
    .use(requireOnboarding)
    .handler(async ({ context, input, errors }) => {
      const { userId } = context.viewer;
      const db = context.database();
      const now = context.services.now();

      if (!(await withinQuota(context.services, "onboarding-save", userId, 200, 3600))) {
        throw new ORPCError("TOO_MANY_REQUESTS");
      }

      if (input.step === "birth") {
        const check = checkBirthDate(input.birthDate, campusToday(now));
        if (!check.ok && check.reason === "underage") {
          await db.transaction((tx) =>
            deleteUnderageAccount(tx, userId, context.account.emailHmac, adulthoodDate(input.birthDate)),
          );
          await context.services.revokeSessions(userId).catch(() => {
            console.error("[onboarding] session revocation failed after an underage declaration");
          });
          throw errors.UNDERAGE();
        }
      }

      try {
        await db.transaction((tx) => saveStep(tx, userId, input, now));
      } catch (error) {
        if (error instanceof InvalidValue) {
          throw errors.INVALID_VALUE({ data: { field: error.field } });
        }
        throw error;
      }
      return toState(await loadProgress(db, userId), now);
    }),

  complete: os.onboarding.complete
    .use(requireViewer)
    .use(requireOnboarding)
    .handler(async ({ context, errors }) => {
      const { userId } = context.viewer;
      const db = context.database();
      const now = context.services.now();
      const today = campusToday(now);

      await db.transaction(async (tx) => {
        const loaded = await loadProgress(tx, userId);
        const missing = missingSteps(loaded.progress, today);
        const { draft, progress, prefs } = loaded;
        if (
          missing.length > 0 ||
          !progress.firstName ||
          !progress.birthDate ||
          !progress.gender ||
          !progress.graduationYear
        ) {
          throw errors.INCOMPLETE({ data: { missing } });
        }
        const completeness = profileCompleteness({
          photos: progress.photos,
          photosWithAltText: 0,
          promptAnswers: progress.promptAnswers,
          interests: progress.interests,
          hasProgram: Boolean(draft.program),
          languages: 0,
          hasAnthem: false,
          photoVerified: false,
        });
        await upsertPreferences(tx, userId, {
          modes: effectiveModes(prefs?.modes ?? [], progress.sensitiveConsent),
        });
        await activateAccount(tx, userId, {
          profile: {
            firstName: progress.firstName,
            birthDate: progress.birthDate,
            gender: progress.gender,
            pronouns: draft.pronouns ?? null,
            program: draft.program ?? null,
            graduationYear: progress.graduationYear,
            intentions: draft.intentions ?? [],
            completeness: completeness.score,
          },
          verifiedAt: now,
          reverifyDueAt: new Date(`${nextReverificationDue(today)}T00:00:00Z`),
        });
        await deleteOnboardingDraft(tx, userId);
      });
      return { ok: true as const };
    }),
};
