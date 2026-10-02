/**
 * The Pact (PAC-02, PAC-03, docs/06-matching.md, section 9): one match per
 * person and per mode, computed once for the whole campus, revealed to
 * everyone at the same minute.
 */
export const PACT_STATUSES = ["draft", "open", "closed", "computed", "revealed"] as const;
export type PactStatus = (typeof PACT_STATUSES)[number];

export const PACT_RULES = {
  /** Answers needed to join: enough common questions for a meaningful score (docs/06, section 3). */
  minAnswers: 30,
  /** Better no match than a bad one. Each season can set its own. */
  defaultThreshold: 0.6,
  /** Sparsification: each participant keeps their best edges only. */
  neighbours: 50,
  /** Clients spread their result requests over this window after the reveal signal. */
  revealJitterMs: 3000,
} as const;

/**
 * What a member sees of a season:
 * - `upcoming`: announced, not open yet;
 * - `open`: members can join;
 * - `closed`: participation closed, countdown to the reveal;
 * - `revealing`: the reveal time has passed, results are being published;
 * - `revealed`: results visible to participants.
 */
export const PACT_PHASES = ["upcoming", "open", "closed", "revealing", "revealed"] as const;
export type PactPhase = (typeof PACT_PHASES)[number];

export interface PactSeasonTiming {
  readonly status: PactStatus;
  readonly opensAt: Date;
  readonly closesAt: Date;
  readonly revealAt: Date;
}

export function pactPhase(season: PactSeasonTiming, now: Date): PactPhase {
  if (season.status === "revealed") {
    return "revealed";
  }
  if (season.status === "draft" || now < season.opensAt) {
    return "upcoming";
  }
  if (season.status === "open" && now < season.closesAt) {
    return "open";
  }
  return now < season.revealAt ? "closed" : "revealing";
}

/** Joining (or leaving) is possible only while the season is open, dates included. */
export function canJoinPact(season: PactSeasonTiming, now: Date): boolean {
  return pactPhase(season, now) === "open";
}

/** Results are private until the reveal, then visible to participants only. */
export function canViewPactResult(season: PactSeasonTiming, now: Date, isParticipant: boolean): boolean {
  return isParticipant && pactPhase(season, now) === "revealed";
}

/** The computation runs once participation has closed and until the reveal. */
export function canComputePact(season: PactSeasonTiming, now: Date): boolean {
  return (
    now >= season.closesAt &&
    now < season.revealAt &&
    (season.status === "open" || season.status === "closed" || season.status === "computed")
  );
}
