import type { ReportPriority } from "./reports";

/** Independent P2 reports needed to hide a profile before review (docs/07, section A4). */
export const P2_HOLD_THRESHOLD = 2;

/**
 * Precautionary hiding while a report waits for review: always for P1,
 * from two independent reporters for P2, never for P3.
 */
export function shouldHoldProfile(priority: ReportPriority, independentReporters: number): boolean {
  switch (priority) {
    case "p1":
      return true;
    case "p2":
      return independentReporters >= P2_HOLD_THRESHOLD;
    case "p3":
      return false;
  }
}

/** Reports and blocks a member can file per day: generous for real use, a wall for abuse. */
export const SAFETY_QUOTAS = {
  blocksPerDay: 50,
  reportsPerDay: 20,
  hiddenContacts: 200,
} as const;

/**
 * A recognisable but partial form of a hidden address, shown back to the
 * member who hid it ("ca…@epita.fr"). The address itself is never stored.
 */
export function emailHint(canonicalEmail: string): string {
  const [local = "", domain = ""] = canonicalEmail.split("@");
  return `${local.slice(0, 2)}…@${domain}`;
}
