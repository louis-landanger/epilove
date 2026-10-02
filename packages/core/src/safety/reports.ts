/** Report vocabulary shared by the database, the API contracts and the UI (SAF-02). */
export const REPORT_CONTEXTS = ["profile", "photo", "message", "event"] as const;
export type ReportContext = (typeof REPORT_CONTEXTS)[number];

export const REPORT_REASONS = [
  "harassment",
  "threat",
  "explicit_content",
  "hate",
  "minor",
  "impersonation",
  "outing",
  "spam",
  "not_on_campus",
  "other",
] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

export const REPORT_PRIORITIES = ["p1", "p2", "p3"] as const;
export type ReportPriority = (typeof REPORT_PRIORITIES)[number];

/** Triage of docs/07-confiance-securite.md, section A4. */
export function reportPriority(reason: ReportReason): ReportPriority {
  switch (reason) {
    case "threat":
    case "minor":
      return "p1";
    case "harassment":
    case "explicit_content":
    case "hate":
    case "impersonation":
    case "outing":
      return "p2";
    case "spam":
    case "not_on_campus":
    case "other":
      return "p3";
  }
}
