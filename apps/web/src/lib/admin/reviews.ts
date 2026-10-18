/**
 * The complaint queue of /admin/reviews (wave-2 §11 rule 7): public.reports with target_type 'review'. A dispute
 * is open until an admin keeps or hides the review; then every open dispute of that review closes together.
 */
export const DISPUTE_STATUSES = ["open", "kept", "hidden"] as const;
export type DisputeStatus = (typeof DISPUTE_STATUSES)[number];

export const isDisputeStatus = (value: unknown): value is DisputeStatus => (DISPUTE_STATUSES as readonly unknown[]).includes(value);

export const DISPUTE_TONE = { open: "accent", kept: "neutral", hidden: "warning", dismissed: "neutral" } as const;

export const disputesHref = (status: DisputeStatus | null) => (status ? `/admin/reviews?status=${status}` : "/admin/reviews?status=all");

/** The list row's title: the review's text on one line, or null when the client left only a rating. */
export function reviewExcerpt(body: string | null | undefined, max = 140): string | null {
  const text = (body ?? "").replace(/\s+/g, " ").trim();
  if (!text) return null;
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}
