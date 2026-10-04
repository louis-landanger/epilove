"use client";

import { isLocale, LOCALE_HEADER } from "@atomes/core";
import { passkeyClient } from "@better-auth/passkey/client";
import { adminClient, emailOTPClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

/** Browser client, same origin as the app (`/api/auth`). */
export const authClient = createAuthClient({
  plugins: [emailOTPClient(), passkeyClient(), adminClient()],
  fetchOptions: {
    // The page language picks the language of the sign-in code email and of a new account (PLT-04).
    onRequest(context) {
      const lang = typeof document === "undefined" ? null : document.documentElement.lang;
      if (isLocale(lang)) {
        context.headers.set(LOCALE_HEADER, lang);
      }
      return context;
    },
  },
});

export type AuthClient = typeof authClient;
