import { ageOn, MINIMUM_AGE } from "../people/age";
import { daysBetween } from "../time/calendar";
import type { AccountStatus, Member, Mode, PolicyContext, VisibilityDecision } from "./types";

/** A target inactive for longer than this disappears from discovery (docs/06-matching.md). */
export const ACTIVITY_WINDOW_DAYS = 21;

/** Statuses whose profile can appear in discovery and who can browse it. */
const DISCOVERABLE_STATUSES: ReadonlySet<AccountStatus> = new Set(["active", "restricted"]);

const hidden = (reason: Extract<VisibilityDecision, { visible: false }>["reason"]) =>
  ({ visible: false, reason }) as const;

function isWithinAgeRange(age: number, range: Member["ageRange"]): boolean {
  return age >= range.min && age <= range.max;
}

function compatibleModes(viewer: Member, target: Member): Mode[] {
  return viewer.modes.filter((mode) => {
    if (!target.modes.includes(mode)) {
      return false;
    }
    if (mode === "friends") {
      return true;
    }
    return viewer.interestedIn.includes(target.gender) && target.interestedIn.includes(viewer.gender);
  });
}

/**
 * Can `viewer` discover `target` (deck, Drop, Pact, likes received)?
 *
 * Single source of truth for discovery visibility: every rule is checked in
 * both directions, except incognito and inactivity, which by design only
 * depend on the target. Swipe history and questionnaire dealbreakers are
 * deck-specific and live in `isDeckCandidate`.
 */
export function canSee(viewer: Member, target: Member, context: PolicyContext): VisibilityDecision {
  if (viewer.id === target.id) {
    return hidden("self");
  }

  const viewerAge = ageOn(viewer.birthDate, context.today);
  const targetAge = ageOn(target.birthDate, context.today);
  if (viewerAge < MINIMUM_AGE || targetAge < MINIMUM_AGE) {
    return hidden("underage");
  }

  if (!DISCOVERABLE_STATUSES.has(viewer.status) || !viewer.profileComplete) {
    return hidden("viewer_not_eligible");
  }
  if (!DISCOVERABLE_STATUSES.has(target.status) || !target.profileComplete) {
    return hidden("target_unavailable");
  }

  const { relations } = context;
  if (relations.hasBlocked(viewer.id, target.id) || relations.hasBlocked(target.id, viewer.id)) {
    return hidden("blocked");
  }

  if (viewer.hiddenEmailHmacs.has(target.emailHmac) || target.hiddenEmailHmacs.has(viewer.emailHmac)) {
    return hidden("hidden_contact");
  }

  const sameSchool = viewer.schoolSlug === target.schoolSlug;
  if (sameSchool && (viewer.hideFromOwnSchool || target.hideFromOwnSchool)) {
    return hidden("hidden_school");
  }
  const sameYear = sameSchool && viewer.graduationYear === target.graduationYear;
  if (sameYear && (viewer.hideFromOwnYear || target.hideFromOwnYear)) {
    return hidden("hidden_year");
  }

  if (target.incognito && !relations.hasLiked(target.id, viewer.id)) {
    return hidden("incognito");
  }

  if (daysBetween(target.lastActiveOn, context.today) > ACTIVITY_WINDOW_DAYS) {
    return hidden("inactive");
  }

  if (!isWithinAgeRange(targetAge, viewer.ageRange) || !isWithinAgeRange(viewerAge, target.ageRange)) {
    return hidden("age_preference");
  }

  const modes = compatibleModes(viewer, target);
  if (modes.length === 0) {
    return hidden("no_compatible_mode");
  }

  return { visible: true, modes };
}

export interface DeckContext extends PolicyContext {
  /** True when `actorId` liked or passed `targetId` recently (outside the second-chance window). */
  hasRecentlySwiped(actorId: string, targetId: string): boolean;
  /** True when one of the two members marked a "mandatory" answer the other does not satisfy. */
  violatesDealbreaker(viewerId: string, targetId: string): boolean;
}

/** Discovery visibility plus the deck-only rules. */
export function isDeckCandidate(viewer: Member, target: Member, context: DeckContext): boolean {
  return (
    canSee(viewer, target, context).visible &&
    !context.hasRecentlySwiped(viewer.id, target.id) &&
    !context.violatesDealbreaker(viewer.id, target.id)
  );
}
