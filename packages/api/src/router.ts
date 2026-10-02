import { account } from "./modules/account";
import { campus } from "./modules/campus";
import { media } from "./modules/media";
import { onboarding } from "./modules/onboarding";
import { preferences } from "./modules/preferences";
import { profile } from "./modules/profile";
import { safety } from "./modules/safety";
import { system } from "./modules/system";
import { os } from "./procedures";

/**
 * Aggregates the module routers, one line per module, alphabetical. Each module
 * lives in src/modules/<module>.ts with its contract in packages/contracts/src/<module>.ts.
 */
export const router = os.router({
  account,
  campus,
  media,
  onboarding,
  preferences,
  profile,
  safety,
  system,
});

export type Router = typeof router;
