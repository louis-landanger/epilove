import type { Messages } from "./messages";

// Message keys are type-checked: a typo in `t("...")` fails `pnpm typecheck`.
declare module "next-intl" {
  interface AppConfig {
    Locale: "fr" | "en";
    Messages: Messages;
  }
}
