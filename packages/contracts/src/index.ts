import { campusContract } from "./campus";
import { safetyContract } from "./safety";
import { systemContract } from "./system";
import { waitlistContract } from "./waitlist";

/** One entry per module, alphabetical. Each module lives in src/<module>.ts. */
export const contract = {
  campus: campusContract,
  safety: safetyContract,
  system: systemContract,
  waitlist: waitlistContract,
};

export type Contract = typeof contract;

export * from "./campus";
export * from "./safety";
export * from "./system";
export * from "./waitlist";
