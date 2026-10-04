import { parseSchoolEmail } from "@atomes/core";

/**
 * Forge ID (ONB-11): EPITA's OpenID Connect provider for student projects.
 * It exposes the campus and the graduation year, which proves the member
 * studies in Lyon. Disabled unless configured.
 */
export interface ForgeIdConfig {
  readonly discoveryUrl: string;
  readonly clientId: string;
  readonly clientSecret: string;
  /** Claim holding the campus, and the value meaning Lyon (case-insensitive). */
  readonly campusClaim: string;
  readonly campusValue: string;
  readonly graduationClaim: string | null;
}

export const FORGE_ID_PROVIDER = "forge-id";

export function forgeIdConfigFromEnv(
  env: Record<string, string | undefined> = process.env,
): ForgeIdConfig | null {
  const { FORGE_ID_DISCOVERY_URL, FORGE_ID_CLIENT_ID, FORGE_ID_CLIENT_SECRET } = env;
  if (!FORGE_ID_DISCOVERY_URL || !FORGE_ID_CLIENT_ID || !FORGE_ID_CLIENT_SECRET) {
    return null;
  }
  return {
    discoveryUrl: FORGE_ID_DISCOVERY_URL,
    clientId: FORGE_ID_CLIENT_ID,
    clientSecret: FORGE_ID_CLIENT_SECRET,
    campusClaim: env.FORGE_ID_CAMPUS_CLAIM || "campus",
    campusValue: env.FORGE_ID_CAMPUS_VALUE || "lyon",
    graduationClaim: env.FORGE_ID_GRADUATION_CLAIM || null,
  };
}

export type ForgeIdCheck =
  | { readonly ok: true; readonly email: string; readonly graduationYear: number | null }
  | { readonly ok: false; readonly reason: "not_school_email" | "not_lyon" };

function claim(profile: Record<string, unknown>, path: string): unknown {
  return path
    .split(".")
    .reduce<unknown>(
      (value, key) =>
        value && typeof value === "object" ? (value as Record<string, unknown>)[key] : undefined,
      profile,
    );
}

/** Accepts a Forge ID profile only for an eligible school address on the Lyon campus. */
export function checkForgeIdProfile(profile: Record<string, unknown>, config: ForgeIdConfig): ForgeIdCheck {
  const email = typeof profile.email === "string" ? parseSchoolEmail(profile.email) : null;
  if (!email?.ok) {
    return { ok: false, reason: "not_school_email" };
  }
  const campus = claim(profile, config.campusClaim);
  const campuses = Array.isArray(campus) ? campus : [campus];
  const inLyon = campuses.some(
    (value) => typeof value === "string" && value.trim().toLowerCase() === config.campusValue.toLowerCase(),
  );
  if (!inLyon) {
    return { ok: false, reason: "not_lyon" };
  }
  const graduation = config.graduationClaim ? Number(claim(profile, config.graduationClaim)) : Number.NaN;
  return {
    ok: true,
    email: email.canonicalEmail,
    graduationYear: Number.isInteger(graduation) && graduation > 2000 ? graduation : null,
  };
}
