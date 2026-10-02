/** Errors the waiting list form can show, each with its own message (namespace `waitlist`). */
export const WAITLIST_ERRORS = [
  "required",
  "invalid_format",
  "domain_not_allowed",
  "rate_limited",
  "server_error",
] as const;

export type WaitlistError = (typeof WAITLIST_ERRORS)[number];

export type WaitlistFormState =
  | { readonly status: "idle" }
  | { readonly status: "success" }
  | { readonly status: "error"; readonly error: WaitlistError; readonly email: string };

export const INITIAL_WAITLIST_STATE: WaitlistFormState = { status: "idle" };
