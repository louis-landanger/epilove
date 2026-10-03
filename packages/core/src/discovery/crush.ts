import { pactEligibleModes } from "../pact/edges";
import type { Member, Mode, PolicyContext } from "../policies/types";

/**
 * Secret crush (DEC-08): a member enters the school email of someone they
 * know. If that person does the same, it is an immediate match; otherwise
 * nobody ever learns anything. Only HMAC fingerprints of the addresses are
 * stored and compared.
 */
export const CRUSH_RULES = {
  maxActive: 3,
  durationDays: 90,
  /** Additions per rolling 30 days, withdrawn ones included: limits probing and churn. */
  addsPer30Days: 10,
} as const;

/** What the member sees of their own crush: first letter and school domain only. */
export function crushHint(canonicalEmail: string): string {
  const [local = "", domain = ""] = canonicalEmail.split("@");
  return `${local.slice(0, 1)}•••@${domain}`;
}

/**
 * Mode of the match created by a mutual crush, or null when the pair may not
 * match. Same rules as discovery in both directions; a mutual crush is mutual
 * interest, so incognito does not stand in the way (as for a mutual like).
 * Love when both are open to it, friends otherwise.
 */
export function crushMatchMode(a: Member, b: Member, context: PolicyContext): Mode | null {
  const modes = pactEligibleModes({ member: a, modes: a.modes }, { member: b, modes: b.modes }, context);
  if (modes.length === 0) {
    return null;
  }
  return modes.includes("love") ? "love" : (modes[0] as Mode);
}
