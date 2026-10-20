/**
 * Content reports (legal/product-changes.md Б13, DSA arts. 16, 17, 20): what can be reported and why. The database
 * checks every rule again (migration 20261018201537_content_reports.sql).
 */
export const REPORT_TEXT_MAX = 2000;
export const REPORT_CONTACT_MAX = 200;
/** An appeal is possible this long after the decision (art. 20(1)). */
export const APPEAL_MONTHS = 6;

export const REPORT_REASONS = ["insult", "spam", "false_facts", "personal_data", "illegal", "other"] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

/** What a person reports from the app; a review itself is disputed by its trainer (lib/reviews). */
export const REPORTABLE = ["review_reply", "food_comment", "challenge_alias", "trainer_profile"] as const;
export type ReportableTarget = (typeof REPORTABLE)[number];

export type ReportStatus = "open" | "kept" | "hidden" | "dismissed";
export const REPORT_STATUSES = ["open", "kept", "hidden", "dismissed"] as const satisfies readonly ReportStatus[];

export const REPORT_TONE = { open: "accent", kept: "neutral", hidden: "warning", dismissed: "neutral" } as const;

export const isReportReason = (value: unknown): value is ReportReason => (REPORT_REASONS as readonly unknown[]).includes(value);
export const isReportStatus = (value: unknown): value is ReportStatus => (REPORT_STATUSES as readonly unknown[]).includes(value);

/** A text field once trimmed: null when empty, "long" over the limit. */
export function reportText(value: string | null | undefined, max = REPORT_TEXT_MAX): string | null | "long" {
  const text = (value ?? "").trim();
  if (!text) return null;
  return text.length > max ? "long" : text;
}

/** Whether a decision can still be appealed: decided, not appealed yet, within six months. */
export function canAppeal(decision: { status: ReportStatus; resolvedAt: string | null; appealed: boolean }, now = new Date()): boolean {
  if (decision.status === "open" || decision.appealed || !decision.resolvedAt) return false;
  const until = new Date(decision.resolvedAt);
  until.setMonth(until.getMonth() + APPEAL_MONTHS);
  return now < until;
}
