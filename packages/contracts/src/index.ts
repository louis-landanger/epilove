import { campusContract } from "./campus";
import { campusLifeContract } from "./campus-life";
import { dateSafetyContract } from "./date-safety";
import { devContract } from "./dev";
import { discoveryContract } from "./discovery";
import { eventsContract } from "./events";
import { matchesContract } from "./matches";
import { messagingContract } from "./messaging";
import { notificationsContract } from "./notifications";
import { pactContract } from "./pact";
import { questionnaireContract } from "./questionnaire";
import { realtimeContract } from "./realtime";
import { safetyContract } from "./safety";
import { systemContract } from "./system";

/** One entry per module, alphabetical. Each module lives in src/<module>.ts. */
export const contract = {
  campus: campusContract,
  campusLife: campusLifeContract,
  dateSafety: dateSafetyContract,
  dev: devContract,
  discovery: discoveryContract,
  events: eventsContract,
  matches: matchesContract,
  messaging: messagingContract,
  notifications: notificationsContract,
  pact: pactContract,
  questionnaire: questionnaireContract,
  realtime: realtimeContract,
  safety: safetyContract,
  system: systemContract,
};

export type Contract = typeof contract;

export * from "./campus";
export * from "./campus-life";
export * from "./date-safety";
export * from "./dev";
export * from "./discovery";
export * from "./events";
export * from "./matches";
export * from "./messaging";
export * from "./notifications";
export * from "./pact";
export * from "./questionnaire";
export * from "./realtime";
export * from "./safety";
export * from "./system";
