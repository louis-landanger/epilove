import { getRequestConfig } from "next-intl/server";
import { DEFAULT_LOCALE, messagesFor } from "./messages";

/**
 * French only for now, which keeps pages statically rendered. English (PLT-04)
 * will add locale routing; the message files are already split per locale.
 */
export default getRequestConfig(async () => ({
  locale: DEFAULT_LOCALE,
  timeZone: "Europe/Paris",
  messages: messagesFor(DEFAULT_LOCALE),
}));
