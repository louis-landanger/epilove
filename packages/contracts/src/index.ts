import { campusContract } from "./campus";
import { devContract } from "./dev";
import { questionnaireContract } from "./questionnaire";
import { safetyContract } from "./safety";
import { systemContract } from "./system";

/** One entry per module, alphabetical. Each module lives in src/<module>.ts. */
export const contract = {
  campus: campusContract,
  dev: devContract,
  questionnaire: questionnaireContract,
  safety: safetyContract,
  system: systemContract,
};

export type Contract = typeof contract;

export * from "./campus";
export * from "./dev";
export * from "./questionnaire";
export * from "./safety";
export * from "./system";
