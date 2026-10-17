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
import { getDictionary, getLocale } from "@/i18n/server";
import { personName } from "@/lib/admin/people";
import { requireAdmin } from "@/lib/admin/require-admin";
import { FEEDBACK_STATUSES, isFeedbackStatus, STATUS_TONE, type FeedbackStatus } from "@/lib/feedback/status";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  return { title: t.adminFeedback.title };
}

const PAGE = 100;
const href = (status: FeedbackStatus | null) => (status ? `/admin/feedback?status=${status}` : "/admin/feedback");

async function Inbox({ searchParams }: { searchParams: PageProps<"/[lang]/admin/feedback">["searchParams"] }) {
  const [t, locale, { status: raw }] = await Promise.all([getDictionary(), getLocale(), searchParams]);
  const copy = t.adminFeedback;
  // New messages first by default: that is the team's queue.
  const status = raw === "all" ? null : isFeedbackStatus(raw) ? raw : "new";
  const { supabase, timeZone } = await requireAdmin();
  let query = supabase
    .from("feedback")
    .select("id, kind, body, status, created_at, github_issue_url, author:profiles!feedback_user_id_fkey(first_name, last_name, username)")
    .order("created_at", { ascending: false })
    .limit(PAGE);
  if (status) query = query.eq("status", status);
  const { data: rows, error } = await query;
  if (error) throw new Error(`loading feedback failed: ${error.code}`);
  const date = new Intl.DateTimeFormat(INTL_LOCALE[locale], { dateStyle: "medium", timeStyle: "short", timeZone });

  return (
    <div className="flex flex-col gap-4">
      <ChipRow label={copy.filters}>
        {FEEDBACK_STATUSES.map((value) => (
          <Chip key={value} href={href(value)} selected={status === value}>
            {copy.statuses[value]}
          </Chip>
        ))}
        <Chip href="/admin/feedback?status=all" selected={status === null}>
          {copy.all}
        </Chip>
      </ChipRow>
      {rows.length === 0 ? (
        <EmptyState icon={MessageSquareText} title={copy.emptyTitle} description={copy.emptyText} />
      ) : (
        <ListGroup>
          {rows.map((row) => (
            <ListRow
              key={row.id}
              href={`/admin/feedback/${row.id}`}
              title={<span className="line-clamp-2">{row.body}</span>}
              subtitle={[
                t.feedback.kinds[row.kind],
                row.author ? personName(row.author, copy.noName) : copy.deleted,
                date.format(new Date(row.created_at)),
              ].join(" · ")}
              trailing={<Badge tone={STATUS_TONE[row.status]}>{copy.statuses[row.status]}</Badge>}
            />
          ))}
        </ListGroup>
      )}
    </div>
  );
}

/** The feedback inbox (screens.md "/admin/feedback", ADM-9): messages by status, newest first. */
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
