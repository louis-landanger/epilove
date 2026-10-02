import { campusContract } from "./campus";
import { mediaContract } from "./media";
import { onboardingContract } from "./onboarding";
import { profileContract } from "./profile";
import { safetyContract } from "./safety";
import { systemContract } from "./system";

/** One entry per module, alphabetical. Each module lives in src/<module>.ts. */
export const contract = {
  campus: campusContract,
  media: mediaContract,
  onboarding: onboardingContract,
  profile: profileContract,
  safety: safetyContract,
  system: systemContract,
};

export type Contract = typeof contract;

export * from "./campus";
export * from "./media";
export * from "./onboarding";
export * from "./profile";
export * from "./safety";
export * from "./system";
