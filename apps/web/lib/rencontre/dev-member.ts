/**
 * Development sign-in: the member chosen on /dev is kept in this cookie, which
 * the API's development resolver reads (packages/api/src/context.ts), only
 * when DEV_AUTH=1 and APP_ENV is development or test.
 */
// Same cookie as the API's development resolver and the app shell guard (packages/api/src/context.ts).
export const DEV_MEMBER_COOKIE = "epilove_dev_user";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function isDevEnvironment(env: Record<string, string | undefined> = process.env): boolean {
  return env.APP_ENV === "development" || env.APP_ENV === "test";
}

/** The member id held by the cookie, when it looks like a UUID. */
export function parseDevMember(value: string | undefined | null): string | null {
  return value && UUID_PATTERN.test(value) ? value : null;
}
