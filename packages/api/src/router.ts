import { campus } from "./modules/campus";
import { dev } from "./modules/dev";
import { discovery } from "./modules/discovery";
import { matches } from "./modules/matches";
import { messaging } from "./modules/messaging";
import { questionnaire } from "./modules/questionnaire";
import { realtime } from "./modules/realtime";
import { safety } from "./modules/safety";
import { system } from "./modules/system";
import { os } from "./procedures";

/**
 * Aggregates the module routers, one line per module, alphabetical. Each module
 * lives in src/modules/<module>.ts with its contract in packages/contracts/src/<module>.ts.
 */
export const router = os.router({
  campus,
  dev,
  discovery,
  matches,
  messaging,
  questionnaire,
  realtime,
  safety,
  system,
});

export type Router = typeof router;
