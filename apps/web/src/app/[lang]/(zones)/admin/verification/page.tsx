import type { Metadata } from "next";
import { BadgeCheck, FileText } from "lucide-react";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Screen } from "@/components/shell/screen";
import { ScreenHeader } from "@/components/shell/screen-header";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { ListGroup } from "@/components/ui/list";
import { SkeletonRows } from "@/components/ui/skeleton";
import { DecisionControls } from "@/components/verification/decision-controls";
import { INTL_LOCALE } from "@/i18n/config";
import { interpolate } from "@/i18n/format";
import { getDictionary, getLocale } from "@/i18n/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { STATUS_TONE } from "@/lib/verification/status";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  return { title: t.verification.admin.title };
}

/** Temporary links to the documents (screens.md: "документы (временные ссылки)"). */
const LINK_TTL_SECONDS = 600;
const HISTORY_SIZE = 20;

type Person = { first_name: string | null; last_name: string | null; username: string | null } | null;

function personName(person: Person, fallback: string): string {
  if (!person) return fallback;
  const fullName = [person.first_name, person.last_name].map((part) => part?.trim()).filter(Boolean).join(" ");
  return fullName || (person.username ? `@${person.username}` : fallback);
}

type ServerClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

/** Trainers under review, oldest submission first, with their documents and signed links to them. */
async function loadQueue(supabase: ServerClient) {
  const { data: trainers, error } = await supabase
    .from("trainer_profiles")
    .select("user_id, profile:profiles!trainer_profiles_user_id_fkey(first_name, last_name, username)")
    .eq("verification_status", "pending");
  if (error) throw new Error(`loading the verification queue failed: ${error.code}`);
  if (!trainers.length) return [];

  const ids = trainers.map((trainer) => trainer.user_id);
  const [{ data: submissions, error: submissionsError }, { data: documents, error: documentsError }] = await Promise.all([
    supabase
      .from("trainer_verifications")
      .select("trainer_id, created_at")
      .in("trainer_id", ids)
      .eq("decision", "pending")
      .order("created_at", { ascending: false }),
    supabase.from("trainer_certificates").select("id, trainer_id, title, storage_path").in("trainer_id", ids).order("created_at"),
  ]);
  if (submissionsError || documentsError) throw new Error("loading the verification queue failed");

  const { data: links } = documents.length
    ? await supabase.storage.from("certificates").createSignedUrls(
        documents.map((document) => document.storage_path),
        LINK_TTL_SECONDS,
      )
    : { data: [] };
  const linkByPath = new Map((links ?? []).flatMap((link) => (link.path && link.signedUrl ? [[link.path, link.signedUrl]] : [])));

  // Newest first, so the first one seen is the latest submission of each trainer.
  const sentAt = new Map<string, string>();
  for (const submission of submissions) if (!sentAt.has(submission.trainer_id)) sentAt.set(submission.trainer_id, submission.created_at);

  return trainers
    .map((trainer) => ({
      id: trainer.user_id,
      profile: trainer.profile,
      sentAt: sentAt.get(trainer.user_id) ?? null,
      documents: documents
        .filter((document) => document.trainer_id === trainer.user_id)
        .map((document) => ({ id: document.id, title: document.title, href: linkByPath.get(document.storage_path) })),
    }))
    .sort((a, b) => (a.sentAt ?? "").localeCompare(b.sentAt ?? ""));
}

async function loadHistory(supabase: ServerClient) {
  const { data, error } = await supabase
    .from("trainer_verifications")
    .select("id, decision, reason, created_at, trainer:trainer_profiles(profile:profiles!trainer_profiles_user_id_fkey(first_name, last_name, username))")
    .in("decision", ["verified", "rejected"])
    .order("created_at", { ascending: false })
    .limit(HISTORY_SIZE);
  if (error) throw new Error(`loading verification history failed: ${error.code}`);
  return data;
}

async function VerificationQueue() {
  const [t, locale] = await Promise.all([getDictionary(), getLocale()]);
  const copy = t.verification.admin;
  const supabase = await createSupabaseServerClient();
  const { data: session } = await supabase.auth.getClaims();
  const userId = session?.claims.sub;
  if (!userId) notFound();

  const [{ data: admin }, { data: settings }] = await Promise.all([
    supabase.from("user_roles").select("role").eq("user_id", userId).eq("role", "admin").maybeSingle(),
    supabase.from("user_settings").select("time_zone").eq("user_id", userId).maybeSingle(),
  ]);
  // The proxy already answers 404 to everyone else (ADM-12); this keeps the page closed on its own too.
  if (!admin) notFound();

  const [queue, history] = await Promise.all([loadQueue(supabase), loadHistory(supabase)]);
  const dateFormat = new Intl.DateTimeFormat(INTL_LOCALE[locale], {
    day: "numeric",
    month: "long",
    timeZone: settings?.time_zone ?? "Europe/Moscow",
  });
  const date = (value: string) => dateFormat.format(new Date(value));

  return (
    <div className="flex flex-col gap-8">
      {queue.length === 0 ? (
        <EmptyState icon={BadgeCheck} title={copy.emptyTitle} description={copy.emptyText} />
      ) : (
        <ListGroup header={copy.queue} headingLevel={2}>
          {queue.map((trainer) => (
            <div
              key={trainer.id}
              className="relative flex flex-col gap-3 px-4 py-3 before:pointer-events-none before:absolute before:-top-px before:right-0 before:left-4 before:h-px before:bg-line"
            >
              <div className="flex flex-col gap-0.5">
                <h3 className="text-headline break-words">{personName(trainer.profile, copy.deletedAccount)}</h3>
                {trainer.sentAt ? <p className="text-subhead text-ink-2">{interpolate(copy.sentOn, { date: date(trainer.sentAt) })}</p> : null}
              </div>
              {trainer.documents.length ? (
                <ul className="flex flex-col gap-2">
                  {trainer.documents.map((document) => (
                    <li key={document.id} className="flex items-center gap-2">
                      <FileText aria-hidden size={18} strokeWidth={1.75} className="shrink-0 text-ink-2" />
                      {document.href ? (
                        <a
                          href={document.href}
                          target="_blank"
                          rel="noreferrer"
                          aria-label={interpolate(copy.openDocument, { title: document.title })}
                          className="min-w-0 text-callout break-words text-accent-ink underline-offset-2 hover:underline"
                        >
                          {document.title}
                        </a>
                      ) : (
                        <span className="min-w-0 text-callout break-words">{document.title}</span>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-callout text-ink-2">{copy.noDocuments}</p>
              )}
              <DecisionControls trainerId={trainer.id} />
            </div>
          ))}
        </ListGroup>
      )}

      {history.length ? (
        <ListGroup header={copy.history} headingLevel={2}>
          {history.map((entry) => {
            const decision = entry.decision === "verified" ? "verified" : "rejected";
            return (
              <div
                key={entry.id}
                className="relative flex flex-col gap-1 px-4 py-3 before:pointer-events-none before:absolute before:-top-px before:right-0 before:left-4 before:h-px before:bg-line"
              >
                <div className="flex items-start justify-between gap-3">
                  <p className="min-w-0 text-body leading-[22px] break-words">{personName(entry.trainer?.profile ?? null, copy.deletedAccount)}</p>
                  <Badge tone={STATUS_TONE[decision]} className="mt-px">
                    {t.verification.status[decision]}
                  </Badge>
                </div>
                <p className="text-subhead text-ink-2">
                  {interpolate(decision === "verified" ? copy.historyVerified : copy.historyRejected, { date: date(entry.created_at) })}
                </p>
                {entry.reason ? <p className="text-subhead break-words text-ink-2">{entry.reason}</p> : null}
              </div>
            );
          })}
        </ListGroup>
      ) : null}
    </div>
  );
}

/**
 * Verification queue for admins (screens.md §3.5, PRD wave-1 §4 ADM-4..6): trainers under review with their
 * documents, "Верифицировать" or "Отклонить" with a reason, and the latest decisions. It sits in the app's
 * shell next to the invites until the admin section gets its own frame.
 */
export default async function AdminVerificationPage() {
  const t = await getDictionary();
  return (
    <Screen header={<ScreenHeader title={t.verification.admin.title} back={{ fallbackHref: "/profile" }} />}>
      <div className="flex w-full max-w-2xl flex-col pt-4 md:pt-0">
        <Suspense fallback={<SkeletonRows rows={3} label={t.common.loading} />}>
          <VerificationQueue />
        </Suspense>
      </div>
    </Screen>
  );
}
