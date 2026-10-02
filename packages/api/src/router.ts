import { campus } from "./modules/campus";
import { safety } from "./modules/safety";
import { system } from "./modules/system";
import { waitlist } from "./modules/waitlist";
import { os } from "./procedures";

/**
 * Aggregates the module routers, one line per module, alphabetical. Each module
 * lives in src/modules/<module>.ts with its contract in packages/contracts/src/<module>.ts.
 */
export const router = os.router({
  campus,
  safety,
  system,
  waitlist,
});

export type Router = typeof router;
