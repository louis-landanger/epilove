import { campusContract } from "./campus";
import { devContract } from "./dev";
import { discoveryContract } from "./discovery";
import { matchesContract } from "./matches";
import { questionnaireContract } from "./questionnaire";
import { safetyContract } from "./safety";
import { systemContract } from "./system";

/** One entry per module, alphabetical. Each module lives in src/<module>.ts. */
export const contract = {
  campus: campusContract,
  dev: devContract,
  discovery: discoveryContract,
  matches: matchesContract,
  questionnaire: questionnaireContract,
  safety: safetyContract,
  system: systemContract,
};

export type Contract = typeof contract;

export * from "./campus";
export * from "./dev";
export * from "./discovery";
export * from "./matches";
export * from "./questionnaire";
export * from "./safety";
export * from "./system";
