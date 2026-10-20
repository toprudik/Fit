import type { ReportStatus } from "@/lib/reports/reports";

/**
 * The queue of /admin/reports (content reports, DSA arts. 16, 17, 20): every report except a trainer's first dispute
 * of a review, which /admin/reviews decides; appeals of any kind land here, for an admin other than the first one.
 */
export const REPORTS_QUEUE_FILTER = "target_type.neq.review,appeal_of.not.is.null";

export const reportsHref = (status: ReportStatus | null) => (status ? `/admin/reports?status=${status}` : "/admin/reports?status=all");
