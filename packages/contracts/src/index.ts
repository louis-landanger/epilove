import { accountContract } from "./account";
import { campusContract } from "./campus";
import { mediaContract } from "./media";
import { onboardingContract } from "./onboarding";
import { preferencesContract } from "./preferences";
import { profileContract } from "./profile";
import { safetyContract } from "./safety";
import { systemContract } from "./system";

/** One entry per module, alphabetical. Each module lives in src/<module>.ts. */
export const contract = {
  account: accountContract,
  campus: campusContract,
  media: mediaContract,
  onboarding: onboardingContract,
  preferences: preferencesContract,
  profile: profileContract,
  safety: safetyContract,
  system: systemContract,
};

export type Contract = typeof contract;

export * from "./account";
export * from "./campus";
export * from "./media";
export * from "./onboarding";
export * from "./preferences";
export * from "./profile";
export * from "./safety";
export * from "./system";
