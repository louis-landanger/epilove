/**
 * Development sign-in: the member chosen on /dev is kept in this cookie and
 * sent as the `x-dev-user-id` header, which the API only trusts when
 * DEV_AUTH=1 and APP_ENV is development or test (packages/api/src/context.ts).
 * Not HttpOnly on purpose: browser-side API calls read it to set the header.
 */
// Same cookie as the API's development resolver and the app shell guard (packages/api/src/context.ts).
export const DEV_MEMBER_COOKIE = "epilove_dev_user";
export const DEV_MEMBER_HEADER = "x-dev-user-id";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function isDevEnvironment(env: Record<string, string | undefined> = process.env): boolean {
  return env.APP_ENV === "development" || env.APP_ENV === "test";
}

/** The member id held by the cookie, when it looks like a UUID. */
export function parseDevMember(value: string | undefined | null): string | null {
  return value && UUID_PATTERN.test(value) ? value : null;
}

/** Reads the cookie from `document.cookie` (browser only). */
export function devMemberFromDocument(): string | null {
  if (typeof document === "undefined") {
    return null;
  }
  const entry = document.cookie.split("; ").find((part) => part.startsWith(`${DEV_MEMBER_COOKIE}=`));
  return parseDevMember(entry?.slice(DEV_MEMBER_COOKIE.length + 1));
}
