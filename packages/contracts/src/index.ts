import { accountContract } from "./account";
import { adminContract } from "./admin";
import { campusContract } from "./campus";
import { campusLifeContract } from "./campus-life";
import { communityContract } from "./community";
import { dateSafetyContract } from "./date-safety";
import { devContract } from "./dev";
import { discoveryContract } from "./discovery";
import { eventsContract } from "./events";
import { matchesContract } from "./matches";
import { mediaContract } from "./media";
import { messagingContract } from "./messaging";
import { notificationsContract } from "./notifications";
import { onboardingContract } from "./onboarding";
import { pactContract } from "./pact";
import { preferencesContract } from "./preferences";
import { profileContract } from "./profile";
import { questionnaireContract } from "./questionnaire";
import { realtimeContract } from "./realtime";
import { safetyContract } from "./safety";
import { systemContract } from "./system";
import { verificationContract } from "./verification";
import { waitlistContract } from "./waitlist";

/** One entry per module, alphabetical. Each module lives in src/<module>.ts. */
export const contract = {
  account: accountContract,
  admin: adminContract,
  campus: campusContract,
  campusLife: campusLifeContract,
  community: communityContract,
  dateSafety: dateSafetyContract,
  dev: devContract,
  discovery: discoveryContract,
  events: eventsContract,
  matches: matchesContract,
  media: mediaContract,
  messaging: messagingContract,
  notifications: notificationsContract,
  onboarding: onboardingContract,
  pact: pactContract,
  preferences: preferencesContract,
  profile: profileContract,
  questionnaire: questionnaireContract,
  realtime: realtimeContract,
  safety: safetyContract,
  system: systemContract,
  verification: verificationContract,
  waitlist: waitlistContract,
};

export type Contract = typeof contract;

export * from "./account";
export * from "./admin";
export * from "./campus";
export * from "./campus-life";
export * from "./community";
export * from "./date-safety";
export * from "./dev";
export * from "./discovery";
export * from "./events";
export * from "./matches";
export * from "./media";
export * from "./messaging";
export * from "./notifications";
export * from "./onboarding";
export * from "./pact";
export * from "./preferences";
export * from "./profile";
export * from "./questionnaire";
export * from "./realtime";
export * from "./safety";
export * from "./system";
export * from "./verification";
export * from "./waitlist";
