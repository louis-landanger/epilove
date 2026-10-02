import { account } from "./modules/account";
import { admin } from "./modules/admin";
import { campus } from "./modules/campus";
import { media } from "./modules/media";
import { onboarding } from "./modules/onboarding";
import { preferences } from "./modules/preferences";
import { profile } from "./modules/profile";
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
  media,
  onboarding,
  preferences,
  profile,
  safety,
  system,
  verification,
  waitlist,
});

export type Router = typeof router;
