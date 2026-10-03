import { account } from "./modules/account";
import { admin } from "./modules/admin";
import { campus } from "./modules/campus";
import { campusLife } from "./modules/campus-life";
import { community } from "./modules/community";
import { dateSafety } from "./modules/date-safety";
import { dev } from "./modules/dev";
import { discovery } from "./modules/discovery";
import { events } from "./modules/events";
import { matches } from "./modules/matches";
import { media } from "./modules/media";
import { messaging } from "./modules/messaging";
import { notifications } from "./modules/notifications";
import { onboarding } from "./modules/onboarding";
import { pact } from "./modules/pact";
import { preferences } from "./modules/preferences";
import { profile } from "./modules/profile";
import { questionnaire } from "./modules/questionnaire";
import { realtime } from "./modules/realtime";
import { safety } from "./modules/safety";
import { system } from "./modules/system";
import { verification } from "./modules/verification";
import { waitlist } from "./modules/waitlist";
import { os } from "./procedures";

/**
 * Aggregates the module routers, one line per module, alphabetical. Each module
 * lives in src/modules/<module>.ts with its contract in packages/contracts/src/<module>.ts.
 */
export const router = os.router({
  account,
  admin,
  campus,
  campusLife,
  community,
  dateSafety,
  dev,
  discovery,
  events,
  matches,
  media,
  messaging,
  notifications,
  onboarding,
  pact,
  preferences,
  profile,
  questionnaire,
  realtime,
  safety,
  system,
  verification,
  waitlist,
});

export type Router = typeof router;
