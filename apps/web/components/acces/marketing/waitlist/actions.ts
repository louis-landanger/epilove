"use server";

import { REFERRAL_CODE_PATTERN } from "@atomes/contracts";
import { headers } from "next/headers";
import { getLocale } from "next-intl/server";
import { serverApi } from "../server/api";
import { clientAddress, takeToken } from "./rate-limit";
import type { WaitlistFormState } from "./state";

/**
 * Joins the waiting list (ONB-01). A Server Function so the form also works
 * before JavaScript loads (progressive enhancement), and so the client address
 * is known for rate limiting. Never logs the address.
 */
export async function joinWaitlistAction(
  _previous: WaitlistFormState,
  formData: FormData,
): Promise<WaitlistFormState> {
  const rawEmail = formData.get("email");
  const email = typeof rawEmail === "string" ? rawEmail.trim().slice(0, 320) : "";
  if (email === "") {
    return { status: "error", error: "required", email };
  }

  if (!(await takeToken(clientAddress(await headers())))) {
    return { status: "error", error: "rate_limited", email };
  }

  const rawCode = formData.get("referralCode");
  const referralCode =
    typeof rawCode === "string" && REFERRAL_CODE_PATTERN.test(rawCode) ? rawCode : undefined;

  try {
    const locale = (await getLocale()) as "fr" | "en";
    const result = await serverApi.waitlist.join(
      referralCode ? { email, referralCode, locale } : { email, locale },
    );
    if (!result.ok) {
      return { status: "error", error: result.reason, email };
    }
    return { status: "success" };
  } catch (error) {
    if ((error as { code?: unknown }).code === "TOO_MANY_REQUESTS") {
      return { status: "error", error: "rate_limited", email };
    }
    console.error(`[waitlist] join failed: ${error instanceof Error ? error.name : "unknown"}`);
    return { status: "error", error: "server_error", email };
  }
}
