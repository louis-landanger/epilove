"use client";

import { passkeyClient } from "@better-auth/passkey/client";
import { adminClient, emailOTPClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

/** Browser client, same origin as the app (`/api/auth`). */
export const authClient = createAuthClient({
  plugins: [emailOTPClient(), passkeyClient(), adminClient()],
});

export type AuthClient = typeof authClient;
