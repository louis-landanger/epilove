import type { ReportPriority } from "../safety/reports";

/** Target handling time of a report, by priority (docs/07-confiance-securite.md, A4). */
export const REPORT_TARGET_HOURS: Readonly<Record<ReportPriority, number>> = { p1: 6, p2: 24, p3: 72 };

/**
 * Launch targets of docs/00-vision.md ("Métriques de succès"), to be
 * recalibrated on real headcounts. Shares between 0 and 1.
 */
export const LAUNCH_TARGETS = {
  /** Verified members / campus headcount, 30 days after launch. */
  coverage: 0.3,
  /** Complete profiles (≥ 2 approved photos, 3 prompts) / members. */
  activation: 0.75,
  /** Members still active 30 days after joining / cohort. */
  retention: 0.35,
  /** Matches with at least one message from each side / matches. */
  matchToConversation: 0.55,
  /** Matches between two different schools / matches. */
  crossSchool: 0.5,
  /** Reports handled in under 24 hours / reports handled. */
  reportsWithin24h: 0.95,
} as const;

export type LaunchTarget = keyof typeof LAUNCH_TARGETS;

/** `part / total`, or `null` when there is nothing to measure yet. */
export function share(part: number, total: number): number | null {
  if (!Number.isFinite(part) || !Number.isFinite(total) || total <= 0 || part < 0) {
    return null;
  }
  return Math.min(part / total, 1);
}

export type TargetState = "met" | "missed" | "unknown";

export function targetState(value: number | null, target: LaunchTarget): TargetState {
  if (value === null) {
    return "unknown";
  }
  return value >= LAUNCH_TARGETS[target] ? "met" : "missed";
}
