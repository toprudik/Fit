import type { Metadata } from "next";
import { MessageSquareText } from "lucide-react";
import { Suspense } from "react";
import { Screen } from "@/components/shell/screen";
import { ScreenHeader } from "@/components/shell/screen-header";
import { Badge } from "@/components/ui/badge";
import { Chip, ChipRow } from "@/components/ui/chip";
import { EmptyState } from "@/components/ui/empty-state";
import { ListGroup, ListRow } from "@/components/ui/list";
import { SkeletonRows } from "@/components/ui/skeleton";
import { INTL_LOCALE } from "@/i18n/config";
import { interpolate } from "@/i18n/format";
import { getDictionary, getLocale } from "@/i18n/server";
import { personName } from "@/lib/admin/people";
import { requireAdmin } from "@/lib/admin/require-admin";
import { DUE_TONE, dueState, requestToday } from "@/lib/feedback/data-requests";
import { isDataRequestType } from "@/lib/feedback/input";
import { FEEDBACK_STATUSES, isFeedbackStatus, STATUS_TONE, type FeedbackStatus } from "@/lib/feedback/status";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  return { title: t.adminFeedback.title };
}

const PAGE = 100;
const href = (status: FeedbackStatus | null) => (status ? `/admin/feedback?status=${status}` : "/admin/feedback");
/** The data request log (152-FZ arts. 20, 21): open ones by nearest deadline, then the closed ones, newest first. */
const REQUESTS = "requests";

async function Inbox({ searchParams }: { searchParams: PageProps<"/[lang]/admin/feedback">["searchParams"] }) {
  const [t, locale, { status: raw }] = await Promise.all([getDictionary(), getLocale(), searchParams]);
  const copy = t.adminFeedback;
  // New messages first by default: that is the team's queue.
  const requests = raw === REQUESTS;
  const status = raw === "all" || requests ? null : isFeedbackStatus(raw) ? raw : "new";
  const { supabase, timeZone } = await requireAdmin();
  let query = supabase
    .from("feedback")
    .select(
      "id, kind, request_type, body, status, due_on, created_at, github_issue_url, author:profiles!feedback_user_id_fkey(first_name, last_name, username)",
    )
    .order("created_at", { ascending: false })
    .limit(PAGE);
  if (requests) query = query.eq("kind", "data_request");
  if (status) query = query.eq("status", status);
  const { data: rows, error } = await query;
  if (error) throw new Error(`loading feedback failed: ${error.code}`);
  const date = new Intl.DateTimeFormat(INTL_LOCALE[locale], { dateStyle: "medium", timeStyle: "short", timeZone });
  const day = new Intl.DateTimeFormat(INTL_LOCALE[locale], { day: "numeric", month: "long", timeZone: "UTC" });
  const today = requestToday(timeZone);
  // An open data request shows its deadline instead of the status: that is what the team must keep.
  const badge = (row: (typeof rows)[number]) => {
    if (row.due_on && row.status !== "closed") {
      const state = dueState(row.due_on, today);
      const text = state === "open" ? interpolate(copy.request.dueBadge.open, { date: day.format(new Date(row.due_on)) }) : copy.request.dueBadge[state];
      return <Badge tone={DUE_TONE[state]}>{text}</Badge>;
    }
    return <Badge tone={STATUS_TONE[row.status]}>{copy.statuses[row.status]}</Badge>;
  };
  const list = (items: typeof rows, header?: string) => (
    <ListGroup header={header}>
      {items.map((row) => (
        <ListRow
          key={row.id}
          href={`/admin/feedback/${row.id}`}
          title={<span className="line-clamp-2">{row.body}</span>}
          subtitle={[
            isDataRequestType(row.request_type) ? t.feedback.dataRequest.types[row.request_type] : t.feedback.kinds[row.kind],
            row.author ? personName(row.author, copy.noName) : copy.deleted,
            date.format(new Date(row.created_at)),
          ].join(" · ")}
          trailing={badge(row)}
        />
      ))}
    </ListGroup>
  );
  // The log keeps every request, closed ones too, so the team can show what was asked and when it was answered.
  const open = requests ? rows.filter((row) => row.status !== "closed").sort((a, b) => (a.due_on ?? "").localeCompare(b.due_on ?? "")) : [];
  const closed = requests ? rows.filter((row) => row.status === "closed") : [];

  return (
    <div className="flex flex-col gap-4">
      <ChipRow label={copy.filters}>
        {FEEDBACK_STATUSES.map((value) => (
          <Chip key={value} href={href(value)} selected={status === value}>
            {copy.statuses[value]}
          </Chip>
        ))}
        <Chip href="/admin/feedback?status=all" selected={status === null && !requests}>
          {copy.all}
        </Chip>
        <Chip href={`/admin/feedback?status=${REQUESTS}`} selected={requests}>
          {copy.request.filter}
        </Chip>
      </ChipRow>
      {rows.length === 0 ? (
        <EmptyState icon={MessageSquareText} title={copy.emptyTitle} description={requests ? copy.request.emptyText : copy.emptyText} />
      ) : requests ? (
        <>
          {open.length > 0 ? list(open, copy.request.openHeader) : null}
          {closed.length > 0 ? list(closed, copy.request.closedHeader) : null}
        </>
      ) : (
        list(rows)
      )}
    </div>
  );
}

/**
 * The feedback inbox (screens.md "/admin/feedback", ADM-9): messages by status, newest first, and the log
 * of data requests: open ones by deadline, then the closed ones.
 */
export default async function AdminFeedbackPage({ searchParams }: PageProps<"/[lang]/admin/feedback">) {
  const t = await getDictionary();
  return (
    <Screen header={<ScreenHeader title={t.adminFeedback.title} back={{ fallbackHref: "/admin" }} />}>
      <Suspense fallback={<SkeletonRows rows={5} label={t.common.loading} />}>
        <Inbox searchParams={searchParams} />
      </Suspense>
    </Screen>
  );
}
