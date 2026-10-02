import { campusContract } from "./campus";
import { systemContract } from "./system";

export const contract = {
  campus: campusContract,
  system: systemContract,
};

export type Contract = typeof contract;

export * from "./campus";
export * from "./system";
