import { campus } from "./modules/campus";
import { campusLife } from "./modules/campus-life";
import { dev } from "./modules/dev";
import { discovery } from "./modules/discovery";
import { matches } from "./modules/matches";
import { messaging } from "./modules/messaging";
import { notifications } from "./modules/notifications";
import { pact } from "./modules/pact";
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
  campusLife,
  dev,
  discovery,
  matches,
  messaging,
  notifications,
  pact,
  questionnaire,
  realtime,
  safety,
  system,
});

export type Router = typeof router;
