import { ageOn, MINIMUM_AGE } from "../people/age";
import { canSee } from "./can-see";
import type { AccountStatus, HiddenReason, Member, PolicyContext } from "./types";

/**
 * Who can open a full profile and who can write to whom.
 *
 * Seeing a profile is broader than discovering it (`canSee`): a match stays
 * visible after one of the two pauses their account, and someone who liked
 * you is visible in "Likes" even if the deck would not show them. But the
 * hard rules always win: a block, a hidden contact, a ban or a deletion closes
 * every door, in both directions.
 */

/** Statuses allowed to use the app (browse matches, read and send messages). */
const USING_STATUSES: ReadonlySet<AccountStatus> = new Set(["active", "restricted", "paused"]);
/** Statuses whose profile can still be shown to someone. */
const SHOWABLE_STATUSES: ReadonlySet<AccountStatus> = new Set(["active", "restricted", "paused"]);

export type ProfileAccessReason = HiddenReason | "no_relationship";

/** Why the profile is visible: drives what the screen offers (like, message, nothing). */
export type ProfileAccessVia = "self" | "match" | "discovery" | "liked_you";

export type ProfileAccess =
  | { readonly visible: true; readonly via: ProfileAccessVia }
  | { readonly visible: false; readonly reason: ProfileAccessReason };

const denied = (reason: ProfileAccessReason) => ({ visible: false, reason }) as const;

/** Can this member use the community features (events, campus life)? Adult, with a usable account. */
export function canUseApp(member: Member, today: string): boolean {
  return USING_STATUSES.has(member.status) && ageOn(member.birthDate, today) >= MINIMUM_AGE;
}

function hardRules(viewer: Member, target: Member, context: PolicyContext): ProfileAccessReason | null {
  if (
    ageOn(viewer.birthDate, context.today) < MINIMUM_AGE ||
    ageOn(target.birthDate, context.today) < MINIMUM_AGE
  ) {
    return "underage";
  }
  if (!USING_STATUSES.has(viewer.status)) {
    return "viewer_not_eligible";
  }
  if (!SHOWABLE_STATUSES.has(target.status)) {
    return "target_unavailable";
  }
  const { relations } = context;
  if (relations.hasBlocked(viewer.id, target.id) || relations.hasBlocked(target.id, viewer.id)) {
    return "blocked";
  }
  if (relations.hasEndedMatch(viewer.id, target.id)) {
    return "unmatched";
  }
  if (viewer.hiddenEmailHmacs.has(target.emailHmac) || target.hiddenEmailHmacs.has(viewer.emailHmac)) {
    return "hidden_contact";
  }
  return null;
}

/** Can `viewer` open the full profile of `target` (photos, prompts, compatibility)? */
export function canViewProfile(viewer: Member, target: Member, context: PolicyContext): ProfileAccess {
  if (viewer.id === target.id) {
    return USING_STATUSES.has(viewer.status) || viewer.status === "onboarding"
      ? { visible: true, via: "self" }
      : denied("viewer_not_eligible");
  }

  const hard = hardRules(viewer, target, context);
  if (hard) {
    return denied(hard);
  }

  if (context.relations.hasActiveMatch(viewer.id, target.id)) {
    return { visible: true, via: "match" };
  }
  // Outside a match, a paused member disappears (SAF-05).
  if (target.status === "paused") {
    return denied("target_unavailable");
  }

  const discovery = canSee(viewer, target, context);
  if (discovery.visible) {
    return { visible: true, via: "discovery" };
  }

  // Likes received: someone who liked you stays visible to you, unless they
  // fall under a school or year hiding rule (theirs or yours).
  if (context.relations.hasLiked(target.id, viewer.id) && target.profileComplete) {
    const sameSchool = viewer.schoolSlug === target.schoolSlug;
    const sameYear = sameSchool && viewer.graduationYear === target.graduationYear;
    if (sameSchool && (viewer.hideFromOwnSchool || target.hideFromOwnSchool)) {
      return denied("hidden_school");
    }
    if (sameYear && (viewer.hideFromOwnYear || target.hideFromOwnYear)) {
      return denied("hidden_year");
    }
    return { visible: true, via: "liked_you" };
  }

  return denied(discovery.reason === "self" ? "no_relationship" : discovery.reason);
}

export type MessagingDecision =
  | { readonly allowed: true }
  | { readonly allowed: false; readonly reason: ProfileAccessReason | "no_match" };

/**
 * Can `sender` write to `recipient` (CHAT-02)? Only inside an active match,
 * with no block either way, and while both accounts are usable. Pausing does
 * not close conversations (SAF-05); a restriction only limits likes and pictures.
 */
export function canMessage(sender: Member, recipient: Member, context: PolicyContext): MessagingDecision {
  if (sender.id === recipient.id) {
    return { allowed: false, reason: "self" };
  }
  // Hiding a contact after matching closes the conversation too.
  const hard = hardRules(sender, recipient, context);
  if (hard) {
    return { allowed: false, reason: hard };
  }
  if (!context.relations.hasActiveMatch(sender.id, recipient.id)) {
    return { allowed: false, reason: "no_match" };
  }
  return { allowed: true };
}
