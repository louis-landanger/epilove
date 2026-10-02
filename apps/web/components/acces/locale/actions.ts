"use server";

import { isLocale, LOCALE_COOKIE, localizedPath, splitLocalePrefix } from "@epilove/core";
import type { Route } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { isLocalizedPublicPath } from "@/i18n/paths";
import { serverApi } from "@/lib/server/api-app";
import { getCurrentMember } from "@/lib/server/session";

const ONE_YEAR = 365 * 86_400;

/** Same-origin paths only: no scheme, no `//host`, no backslash. */
function safePath(value: FormDataEntryValue | null): string {
  if (typeof value !== "string" || !/^\/(?![/\\])[^\s\\?#]*$/.test(value)) {
    return "/";
  }
  return splitLocalePrefix(value).pathname;
}

/**
 * Language switcher (PLT-04): remembers the choice in a cookie (an explicit
 * preference, needed for the service), on the account when signed in (emails,
 * other devices), then reloads the page in the new language.
 */
export async function changeLocaleAction(formData: FormData) {
  const locale = formData.get("locale");
  const path = safePath(formData.get("path"));
  if (!isLocale(locale)) {
    redirect(path as Route);
  }
  (await cookies()).set(LOCALE_COOKIE, locale, {
    path: "/",
    maxAge: ONE_YEAR,
    sameSite: "lax",
    httpOnly: true,
    secure: process.env.APP_ENV === "production" || process.env.APP_ENV === "staging",
  });
  if (await getCurrentMember()) {
    await (await serverApi()).account.setLocale({ locale }).catch(() => {
      console.error("[locale] the account language could not be saved");
    });
  }
  redirect((isLocalizedPublicPath(path) ? localizedPath(locale, path) : path) as Route);
}
