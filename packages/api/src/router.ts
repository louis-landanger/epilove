import { campus } from "./modules/campus";
import { safety } from "./modules/safety";
import { system } from "./modules/system";
import { os } from "./procedures";

/**
 * Aggregates the module routers, one line per module, alphabetical. Each module
 * lives in src/modules/<module>.ts with its contract in packages/contracts/src/<module>.ts.
 */
export const router = os.router({
  campus,
  safety,
  system,
});

export type Router = typeof router;
