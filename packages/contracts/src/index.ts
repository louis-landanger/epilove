import { accountContract } from "./account";
import { adminContract } from "./admin";
import { campusContract } from "./campus";
import { mediaContract } from "./media";
import { onboardingContract } from "./onboarding";
import { preferencesContract } from "./preferences";
import { profileContract } from "./profile";
import { safetyContract } from "./safety";
import { systemContract } from "./system";
import { waitlistContract } from "./waitlist";

/** One entry per module, alphabetical. Each module lives in src/<module>.ts. */
export const contract = {
  account: accountContract,
  admin: adminContract,
  campus: campusContract,
  media: mediaContract,
  onboarding: onboardingContract,
  preferences: preferencesContract,
  profile: profileContract,
  safety: safetyContract,
  system: systemContract,
  waitlist: waitlistContract,
};

export type Contract = typeof contract;

export * from "./account";
export * from "./admin";
export * from "./campus";
export * from "./media";
export * from "./onboarding";
export * from "./preferences";
export * from "./profile";
export * from "./safety";
export * from "./system";
export * from "./waitlist";
