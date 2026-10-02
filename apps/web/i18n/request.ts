import { DEFAULT_LOCALE, isLocale, LOCALE_HEADER } from "@epilove/core";
import { headers } from "next/headers";
import { getRequestConfig } from "next-intl/server";
import { messagesFor } from "./messages";

/**
 * The language is resolved once per request by `proxy.ts` (URL prefix, choice
 * cookie, then `Accept-Language`) and handed over in a request header
 * (PLT-04, ADR 0012).
 */
export default getRequestConfig(async () => {
  const resolved = (await headers()).get(LOCALE_HEADER);
  const locale = isLocale(resolved) ? resolved : DEFAULT_LOCALE;
  return { locale, timeZone: "Europe/Paris", messages: messagesFor(locale) };
});
