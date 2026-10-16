import type { Metadata } from "next";
import { ScrollText } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { Screen } from "@/components/shell/screen";
import { ScreenHeader } from "@/components/shell/screen-header";
import { EmptyState } from "@/components/ui/empty-state";
import { ListGroup } from "@/components/ui/list";
import { SkeletonRows } from "@/components/ui/skeleton";
import { INTL_LOCALE } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries";
import { interpolate } from "@/i18n/format";
import { getDictionary, getLocale } from "@/i18n/server";
import { personName, type PersonName } from "@/lib/admin/people";
import { requireAdmin } from "@/lib/admin/require-admin";
import { cn } from "@/lib/utils";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  return { title: t.adminShell.audit.title };
}

type Filter = Exclude<keyof Dictionary["adminShell"]["audit"]["filter"], "all">;
type Action = keyof Dictionary["adminShell"]["audit"]["actions"];

/** The actions behind each filter of the log. */
const FILTERS: Record<Filter, Action[]> = {
  trainer_invite: ["trainer_invite.create", "trainer_invite.revoke"],
  verification: ["verification.decide"],
  user: ["user.block", "user.unblock"],
};
const isFilter = (value: unknown): value is Filter => typeof value === "string" && Object.hasOwn(FILTERS, value);

/** Targets that are accounts: their names come from profiles and link to the user card. */
const PERSON_TARGETS = new Set(["user", "trainer"]);
const LOG_SIZE = 100;

function FilterLinks({ current, copy }: { current: Filter | null; copy: Dictionary["adminShell"]["audit"] }) {
  const options: { id: Filter | null; label: string }[] = [
    { id: null, label: copy.filter.all },
    ...(Object.keys(FILTERS) as Filter[]).map((id) => ({ id, label: copy.filter[id] })),
  ];
  return (
    <nav aria-label={copy.filters}>
      <ul className="flex flex-wrap gap-2">
        {options.map(({ id, label }) => {
          const selected = id === current;
          return (
            <li key={id ?? "all"}>
              <Link
                href={id ? `/admin/audit?action=${id}` : "/admin/audit"}
                aria-current={selected ? "page" : undefined}
                className={cn(
                  "inline-flex h-9 items-center rounded-full px-4 text-subhead font-medium select-none",
                  "transition-[background-color] duration-[var(--duration-instant)] motion-reduce:transition-none",
                  // Selection is inverse (design.md).
                  selected ? "bg-inverse text-on-inverse" : "bg-surface-1 text-ink hover:bg-surface-3",
                )}
              >
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

async function AuditLog({ searchParams }: { searchParams: PageProps<"/[lang]/admin/audit">["searchParams"] }) {
  const [t, locale, params] = await Promise.all([getDictionary(), getLocale(), searchParams]);
  const copy = t.adminShell.audit;
  const filter = isFilter(params.action) ? params.action : null;
  const { supabase, timeZone } = await requireAdmin();

  let query = supabase
    .from("admin_audit_log")
    .select("id, actor_id, action, target_type, target_id, reason, metadata, created_at")
    .order("created_at", { ascending: false })
    .limit(LOG_SIZE);
  if (filter) query = query.in("action", FILTERS[filter]);
  const { data: entries, error } = await query;
  if (error) throw new Error(`loading the audit log failed: ${error.code}`);

  const ids = new Set<string>();
  for (const entry of entries) {
    if (entry.actor_id) ids.add(entry.actor_id);
    if (entry.target_id && entry.target_type && PERSON_TARGETS.has(entry.target_type)) ids.add(entry.target_id);
  }
  const { data: people, error: peopleError } = ids.size
    ? await supabase.from("profiles").select("id, first_name, last_name, username").in("id", [...ids])
    : { data: [], error: null };
  if (peopleError) throw new Error(`loading names for the audit log failed: ${peopleError.code}`);
  const byId = new Map<string, PersonName>(people.map((person) => [person.id, person]));

  const dateTime = new Intl.DateTimeFormat(INTL_LOCALE[locale], { dateStyle: "medium", timeStyle: "short", timeZone });

  return (
    <div className="flex flex-col gap-6">
      <FilterLinks current={filter} copy={copy} />
      {entries.length === 0 ? (
        <EmptyState icon={ScrollText} title={copy.emptyTitle} description={copy.emptyText} />
      ) : (
        <ListGroup header={copy.latest} headingLevel={2}>
          {entries.map((entry) => {
            const label = Object.hasOwn(copy.actions, entry.action) ? copy.actions[entry.action as Action] : entry.action;
            const metadata = entry.metadata as Record<string, unknown> | null;
            const decision = entry.action === "verification.decide" ? metadata?.decision : undefined;
            const decisionLabel = decision === "verified" || decision === "rejected" ? copy.decision[decision] : null;
            const isPerson = Boolean(entry.target_id && entry.target_type && PERSON_TARGETS.has(entry.target_type));
            const actor = entry.actor_id ? personName(byId.get(entry.actor_id), copy.deletedAccount) : null;
            const target = isPerson ? personName(byId.get(entry.target_id!), copy.deletedAccount) : null;
            return (
              // Not a ListRow: who, about whom and the reason each take a line, and the reason may wrap.
              <div
                key={entry.id}
                className="relative flex flex-col gap-1 px-4 py-3 before:pointer-events-none before:absolute before:-top-px before:right-0 before:left-4 before:h-px before:bg-line"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                  <p className="text-body leading-[22px]">{decisionLabel ? `${label}: ${decisionLabel}` : label}</p>
                  <time dateTime={entry.created_at} className="text-footnote text-ink-2 tabular-nums">
                    {dateTime.format(new Date(entry.created_at))}
                  </time>
                </div>
                {actor ? <p className="text-subhead text-ink-2">{interpolate(copy.by, { name: actor })}</p> : null}
                {target ? (
                  <p className="text-subhead text-ink-2">
                    {copy.target}{" "}
                    <Link href={`/admin/users/${entry.target_id}`} className="text-accent-ink underline-offset-2 hover:underline">
                      {target}
                    </Link>
                  </p>
                ) : null}
                {entry.reason ? <p className="text-subhead break-words text-ink">«{entry.reason}»</p> : null}
              </div>
            );
          })}
        </ListGroup>
      )}
    </div>
  );
}

/**
 * «Журнал действий» (screens.md §3.5, ADM-11): the latest admin actions, who did them, about whom and why.
 * The log is append-only; admins read it under RLS.
 */
export default async function AdminAuditPage(props: PageProps<"/[lang]/admin/audit">) {
  const t = await getDictionary();
  return (
    <Screen header={<ScreenHeader title={t.adminShell.audit.title} back={{ fallbackHref: "/admin" }} />}>
      <div className="flex w-full max-w-2xl flex-col pt-4 md:pt-0">
        <Suspense fallback={<SkeletonRows rows={5} label={t.common.loading} />}>
          <AuditLog searchParams={props.searchParams} />
        </Suspense>
      </div>
    </Screen>
  );
}
