import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";
import { DataRequestExtend } from "@/components/admin/data-request-extend";
import { FeedbackIssue, FeedbackReply, FeedbackStatusControl } from "@/components/admin/feedback-controls";
import { Screen } from "@/components/shell/screen";
import { ScreenHeader } from "@/components/shell/screen-header";
import { ListGroup, ListRow } from "@/components/ui/list";
import { SkeletonRows } from "@/components/ui/skeleton";
import { INTL_LOCALE } from "@/i18n/config";
import { interpolate } from "@/i18n/format";
import { getDictionary, getLocale } from "@/i18n/server";
import { personName } from "@/lib/admin/people";
import { requireAdmin } from "@/lib/admin/require-admin";
import { feedbackIssueTarget } from "@/lib/feedback/github";
import { isConsentKind, isDataRequestType } from "@/lib/feedback/input";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  return { title: t.adminFeedback.detailTitle };
}

/** Screenshots open through temporary links, like verification documents. */
const LINK_TTL_SECONDS = 600;

async function Message({ params }: { params: PageProps<"/[lang]/admin/feedback/[id]">["params"] }) {
  const [t, locale, { id }] = await Promise.all([getDictionary(), getLocale(), params]);
  const copy = t.adminFeedback;
  const feedbackId = z.uuid().safeParse(id);
  if (!feedbackId.success) notFound();
  const { supabase, timeZone } = await requireAdmin();
  const { data: row, error } = await supabase
    .from("feedback")
    .select(
      "id, user_id, kind, request_type, consent_kind, due_on, extended_at, extended_reason, body, status, zone, route, platform, app_version, locale, theme, attachment_paths, github_issue_url, reply, replied_at, created_at, author:profiles!feedback_user_id_fkey(first_name, last_name, username)",
    )
    .eq("id", feedbackId.data)
    .maybeSingle();
  if (error) throw new Error(`loading feedback failed: ${error.code}`);
  if (!row) notFound();
  const { data: links } = row.attachment_paths.length
    ? await supabase.storage.from("feedback").createSignedUrls(row.attachment_paths, LINK_TTL_SECONDS)
    : { data: [] };
  const date = new Intl.DateTimeFormat(INTL_LOCALE[locale], { dateStyle: "long", timeStyle: "short", timeZone });
  const value = (text: string | null | undefined) => text || copy.none;
  const day = new Intl.DateTimeFormat(INTL_LOCALE[locale], { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
  const requestType = isDataRequestType(row.request_type) ? row.request_type : null;
  const consentKind = isConsentKind(row.consent_kind) ? row.consent_kind : null;

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3 rounded-lg bg-surface-1 p-4">
        <span className="text-footnote text-ink-2">{t.feedback.kinds[row.kind]}</span>
        <p className="text-body break-words whitespace-pre-wrap">{row.body}</p>
      </section>

      {row.due_on ? (
        <ListGroup>
          {requestType ? <ListRow title={copy.request.type} value={t.feedback.dataRequest.types[requestType]} /> : null}
          {consentKind ? <ListRow title={copy.request.consent} value={t.feedback.dataRequest.consents[consentKind]} /> : null}
          <ListRow title={copy.request.due} value={day.format(new Date(row.due_on))} />
        </ListGroup>
      ) : null}
      {row.due_on && row.extended_at && row.extended_reason ? (
        <p className="px-4 text-footnote break-words text-ink-2">
          {interpolate(copy.request.extendedNote, { date: date.format(new Date(row.extended_at)), reason: row.extended_reason })}
        </p>
      ) : null}
      {/* Publishing stops within 3 working days, with no extension (152-FZ art. 10.1 part 12). */}
      {row.due_on && !row.extended_at && row.status !== "closed" && row.user_id && consentKind !== "publication" ? (
        <DataRequestExtend id={row.id} />
      ) : null}

      <FeedbackStatusControl id={row.id} status={row.status} />

      <ListGroup header={copy.context}>
        <ListRow
          title={copy.author}
          value={row.author ? personName(row.author, copy.noName) : copy.deleted}
          href={row.user_id ? `/admin/users/${row.user_id}` : undefined}
        />
        <ListRow title={copy.sent} value={date.format(new Date(row.created_at))} />
        <ListRow title={copy.zone} value={row.zone ? t.zones[row.zone] : copy.none} />
        <ListRow title={copy.screen} value={value(row.route)} />
        <ListRow title={copy.platform} value={value(row.platform)} />
        <ListRow title={copy.version} value={value(row.app_version)} />
        <ListRow title={copy.language} value={value(row.locale)} />
        <ListRow title={copy.theme} value={value(row.theme)} />
      </ListGroup>

      {links?.length ? (
        <section aria-labelledby="feedback-screenshots" className="flex flex-col gap-2">
          <h2 id="feedback-screenshots" className="px-4 text-footnote text-ink-2">
            {copy.screenshots}
          </h2>
          <ul className="flex flex-wrap gap-3">
            {links.map((link, index) =>
              link.signedUrl ? (
                <li key={link.path ?? index}>
                  <a href={link.signedUrl} target="_blank" rel="noopener noreferrer" className="block">
                    {/* Signed Storage links that expire: nothing for next/image to cache. */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={link.signedUrl}
                      alt={interpolate(copy.screenshot, { n: index + 1 })}
                      className="h-40 w-auto rounded-md bg-surface-2 object-contain"
                    />
                  </a>
                </li>
              ) : null,
            )}
          </ul>
        </section>
      ) : null}

      <section aria-labelledby="feedback-reply" className="flex flex-col gap-2">
        <h2 id="feedback-reply" className="px-4 text-footnote text-ink-2">
          {copy.reply}
        </h2>
        {row.reply ? (
          <div className="flex flex-col gap-1 rounded-lg bg-surface-1 p-4">
            <p className="text-body break-words whitespace-pre-wrap">{row.reply}</p>
            {row.replied_at ? (
              <span className="text-footnote text-ink-2">{interpolate(copy.repliedAt, { date: date.format(new Date(row.replied_at)) })}</span>
            ) : null}
          </div>
        ) : null}
        {row.user_id ? (
          <FeedbackReply id={row.id} hasReply={row.reply !== null} />
        ) : (
          <p className="px-4 text-footnote text-ink-2">{copy.replyDeleted}</p>
        )}
      </section>

      {/* A data request holds personal details and never goes to GitHub. */}
      {row.kind === "data_request" ? null : (
        <section aria-labelledby="feedback-issue" className="flex flex-col gap-2">
          <h2 id="feedback-issue" className="px-4 text-footnote text-ink-2">
            {copy.issue}
          </h2>
          <FeedbackIssue id={row.id} url={row.github_issue_url} enabled={feedbackIssueTarget() !== null} />
        </section>
      )}
    </div>
  );
}

/** One feedback message for the team (ADM-9): text, context, author, screenshots, status and the GitHub issue. */
export default async function AdminFeedbackMessagePage({ params }: PageProps<"/[lang]/admin/feedback/[id]">) {
  const t = await getDictionary();
  return (
    <Screen header={<ScreenHeader title={t.adminFeedback.detailTitle} back={{ fallbackHref: "/admin/feedback" }} />}>
      <Suspense fallback={<SkeletonRows rows={5} label={t.common.loading} />}>
        <Message params={params} />
      </Suspense>
    </Screen>
  );
}
