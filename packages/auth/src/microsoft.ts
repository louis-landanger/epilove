import { parseSchoolEmail } from "@atomes/core";

/**
 * Microsoft sign-in (ONB-10, exploration, ADR 0013): each school runs its own
 * Microsoft 365 tenant. Only the listed tenants are accepted, and only for an
 * eligible school address. Disabled unless configured.
 */
export interface MicrosoftConfig {
  readonly clientId: string;
  readonly clientSecret: string;
  /** Directory (tenant) ids of the five schools, lower case. */
  readonly allowedTenants: readonly string[];
}

export const MICROSOFT_PROVIDER = "microsoft";

const TENANT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function microsoftConfigFromEnv(
  env: Record<string, string | undefined> = process.env,
): MicrosoftConfig | null {
  const { MICROSOFT_CLIENT_ID, MICROSOFT_CLIENT_SECRET, MICROSOFT_ALLOWED_TENANTS } = env;
  const allowedTenants = (MICROSOFT_ALLOWED_TENANTS ?? "")
    .split(",")
    .map((tenant) => tenant.trim().toLowerCase())
    .filter((tenant) => TENANT_ID.test(tenant));
  // Without an explicit list of school tenants, any organisation could sign in: stay off.
  if (!MICROSOFT_CLIENT_ID || !MICROSOFT_CLIENT_SECRET || allowedTenants.length === 0) {
    return null;
  }
  return { clientId: MICROSOFT_CLIENT_ID, clientSecret: MICROSOFT_CLIENT_SECRET, allowedTenants };
}

export type MicrosoftCheck =
  | { readonly ok: true; readonly email: string }
  | { readonly ok: false; readonly reason: "tenant_not_allowed" | "not_school_email" };

/** Accepts a Microsoft profile only from a school tenant and for an eligible school address. */
export function checkMicrosoftProfile(
  profile: { tid?: unknown; email?: unknown; preferred_username?: unknown },
  config: MicrosoftConfig,
): MicrosoftCheck {
  const tenant = typeof profile.tid === "string" ? profile.tid.toLowerCase() : "";
  if (!config.allowedTenants.includes(tenant)) {
    return { ok: false, reason: "tenant_not_allowed" };
  }
  // Work accounts often carry the address in `preferred_username` only.
  const raw = typeof profile.email === "string" && profile.email ? profile.email : profile.preferred_username;
  const email = typeof raw === "string" ? parseSchoolEmail(raw) : null;
  if (!email?.ok) {
    return { ok: false, reason: "not_school_email" };
  }
  return { ok: true, email: email.canonicalEmail };
}
