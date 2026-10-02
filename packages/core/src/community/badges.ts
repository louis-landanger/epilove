/**
 * Discreet badges (COM-04). Never anything about popularity (likes, matches,
 * views): only facts about the member's own path on the app.
 */
export const BADGES = ["founder", "photo_verified", "ambassador"] as const;
export type Badge = (typeof BADGES)[number];

/** Badges granted by a person (moderator or team), the others are computed. */
export const GRANTED_BADGES = ["photo_verified", "ambassador"] as const satisfies readonly Badge[];
export type GrantedBadge = (typeof GRANTED_BADGES)[number];

/** Public opening: the Pact's reveal, Thursday 11 February 2027 at 20:00 in Lyon (docs/09). */
export const PUBLIC_LAUNCH_AT = new Date("2027-02-11T19:00:00Z");

/** "Fondateur": signed up before the public opening. */
export function badgesOf(
  member: { readonly createdAt: Date; readonly granted: ReadonlySet<string> },
  launchAt: Date = PUBLIC_LAUNCH_AT,
): Badge[] {
  return BADGES.filter((badge) =>
    badge === "founder" ? member.createdAt.getTime() < launchAt.getTime() : member.granted.has(badge),
  );
}
