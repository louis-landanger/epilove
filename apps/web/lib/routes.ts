import type { Route } from "next";

/** Where signed-in members land. `/decouvrir` belongs to session B (cast until the merge). */
export const HOME_PATH = "/decouvrir" as Route;
export const ONBOARDING_PATH = "/onboarding" as Route;
export const SIGN_IN_PATH = "/connexion" as Route;

/** Only same-site relative paths are accepted as a post-sign-in destination. */
export function safeNextPath(value: string | null | undefined): Route | null {
  if (!value?.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) {
    return null;
  }
  return value as Route;
}
