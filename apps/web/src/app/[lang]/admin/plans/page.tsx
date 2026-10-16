import type { Metadata } from "next";
import { Search, UserX } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";
import { DeclineRequest } from "@/components/plans/decline-request";
import { GrantForm } from "@/components/plans/grant-form";
import { RevokeGrant } from "@/components/plans/revoke-grant";
import { Screen } from "@/components/shell/screen";
import { ScreenHeader } from "@/components/shell/screen-header";
import { PersonAvatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ListGroup, ListRow } from "@/components/ui/list";
import { SkeletonRows } from "@/components/ui/skeleton";
import { TextField } from "@/components/ui/text-field";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/dictionaries";
import { interpolate } from "@/i18n/format";
import { getDictionary, getLocale } from "@/i18n/server";
import { personName, type PersonName } from "@/lib/admin/people";
import { requireAdmin } from "@/lib/admin/require-admin";
import { formatPlanDate, isPaidPlan, isPlanCode, PLAN_TIER, type PaidPlan } from "@/lib/plans/plans";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  return { title: t.adminShell.plans.title };
}

type SearchParams = PageProps<"/[lang]/admin/plans">["searchParams"];
type Copy = Dictionary["adminShell"]["plans"];

const HISTORY_SIZE = 50;
const ROW_LINE =
  "relative flex flex-col gap-1 px-4 py-3 before:pointer-events-none before:absolute before:-top-px before:right-0 before:left-4 before:h-px before:bg-line";

type Grant = {
  id: string;
  plan_code: string;
  reason: string;
  starts_at: string;
  expires_at: string | null;
  revoked_at: string | null;
  revoke_reason: string | null;
};

/** Revoked, ended by time or still working. Read per request, like the database checks it. */
function grantState(grant: Grant): "active" | "expired" | "revoked" {
  if (grant.revoked_at) return "revoked";
  return grant.expires_at && new Date(grant.expires_at).getTime() <= Date.now() ? "expired" : "active";
}

const STATE_TONE = { active: "success", expired: "neutral", revoked: "danger" } as const;

function PlanBadge({ code, t }: { code: string; t: Dictionary }) {
  if (!isPlanCode(code)) return <Badge>{code}</Badge>;
  return <Badge tone={isPaidPlan(code) ? PLAN_TIER[code] : "neutral"}>{t.plans.names[code]}</Badge>;
}

/** One grant: the plan, its period, the reason and, for the history, whose it is and its state. */
function GrantRow({
  grant,
  t,
  locale,
  timeZone,
  person,
  admin,
  children,
}: {
  grant: Grant;
  t: Dictionary;
  locale: Locale;
  timeZone: string;
  person?: { id: string; name: string };
  admin?: string;
  children?: React.ReactNode;
}) {
  const copy = t.adminShell.plans;
  const date = (value: string) => formatPlanDate(locale, value, timeZone);
  const state = grantState(grant);
  const period = grant.expires_at
    ? interpolate(copy.history.period, { from: date(grant.starts_at), until: date(grant.expires_at) })
    : interpolate(copy.history.periodOpen, { from: date(grant.starts_at) });
  return (
    <div className={ROW_LINE}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex min-w-0 flex-wrap items-center gap-2 text-body">
          {person ? (
            <Link href={`/admin/plans?user=${person.id}`} className="break-words text-accent-ink underline-offset-2 hover:underline">
              {person.name}
            </Link>
          ) : null}
          <PlanBadge code={grant.plan_code} t={t} />
        </p>
        {person ? <Badge tone={STATE_TONE[state]}>{copy.history[state]}</Badge> : null}
      </div>
      <p className="text-subhead text-ink-2">{period}</p>
      {admin ? <p className="text-subhead text-ink-2">{interpolate(copy.grantedBy, { name: admin })}</p> : null}
      <p className="text-subhead break-words text-ink">{interpolate(copy.history.reason, { reason: grant.reason })}</p>
      {grant.revoke_reason ? (
        <p className="text-subhead break-words text-ink">{interpolate(copy.history.revokeReason, { reason: grant.revoke_reason })}</p>
      ) : null}
      {children ? <div className="pt-2">{children}</div> : null}
    </div>
  );
}

async function FindPerson({ query, copy, t }: { query: string; copy: Copy; t: Dictionary }) {
  const { supabase } = await requireAdmin();
  const users = query ? await supabase.rpc("admin_search_users", { p_query: query, p_limit: 20 }) : null;
  if (users?.error) throw new Error(`searching users failed: ${users.error.code}`);
  return (
    <div className="flex flex-col gap-4">
      <p className="px-1 text-callout text-ink-2">{copy.text}</p>
      {/* A plain GET form, as in «Пользователи»: the search lives in the URL. */}
      <form role="search" method="get" className="flex flex-col gap-3 rounded-lg bg-surface-1 p-4">
        <TextField
          name="q"
          type="search"
          label={t.adminShell.users.searchLabel}
          hint={t.adminShell.users.searchHint}
          defaultValue={query}
          maxLength={100}
          autoComplete="off"
        />
        <div>
          <Button type="submit" size="sm" variant="secondary" icon={Search}>
            {t.adminShell.users.search}
          </Button>
        </div>
      </form>
      {users ? (
        users.data.length === 0 ? (
          <EmptyState icon={UserX} title={t.adminShell.users.emptyTitle} description={t.adminShell.users.emptyText} />
        ) : (
          <ListGroup header={copy.results} headingLevel={2}>
            {users.data.map((user) => {
              const name = personName(user, t.adminShell.users.noName);
              return (
                <ListRow
                  key={user.user_id}
                  href={`/admin/plans?user=${user.user_id}`}
                  avatar={{ name, src: user.photo_url }}
                  title={name}
                  subtitle={user.username ? `@${user.username}` : interpolate(t.adminShell.users.telegramId, { id: String(user.telegram_id) })}
                  trailing={user.is_trainer ? <Badge className="max-sm:hidden">{t.adminShell.users.badges.trainer}</Badge> : null}
                />
              );
            })}
          </ListGroup>
        )
      ) : null}
    </div>
  );
}

async function SelectedPerson({ userId, plan, t, locale }: { userId: string; plan?: PaidPlan; t: Dictionary; locale: Locale }) {
  const copy = t.adminShell.plans;
  const { supabase, timeZone } = await requireAdmin();
  const [card, grants] = await Promise.all([
    supabase.rpc("admin_user_card", { p_user_id: userId }).maybeSingle(),
    supabase
      .from("plan_grants")
      .select("id, plan_code, reason, starts_at, expires_at, revoked_at, revoke_reason")
      .eq("user_id", userId)
      .is("revoked_at", null)
      .order("created_at", { ascending: false }),
  ]);
  if (card.error) throw new Error(`loading the user failed: ${card.error.code}`);
  if (grants.error) throw new Error(`loading grants failed: ${grants.error.code}`);
  // A trainer's card, the deleted-client stub and unknown ids get no plans.
  if (!card.data) notFound();
  const user = card.data;
  const name = personName(user, t.adminShell.users.noName);
  const active = grants.data.filter((grant) => grantState(grant) === "active");

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-4 px-1">
        <PersonAvatar name={name} src={user.photo_url} size={64} decorative />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h2 className="text-title-3 font-bold break-words">
            <Link href={`/admin/users/${user.user_id}`} className="underline-offset-2 hover:underline">
              {name}
            </Link>
          </h2>
          <Link href="/admin/plans" className="text-subhead text-accent-ink underline-offset-2 hover:underline">
            {copy.clear}
          </Link>
        </div>
      </div>

      <ListGroup header={copy.current} headingLevel={2}>
        {active.length === 0 ? <p className="px-4 py-3 text-body text-ink-2">{copy.noGrants}</p> : null}
        {active.map((grant) => (
          <GrantRow key={grant.id} grant={grant} t={t} locale={locale} timeZone={timeZone}>
            <RevokeGrant grantId={grant.id} />
          </GrantRow>
        ))}
      </ListGroup>

      <section id="grant" aria-labelledby="grant-header" className="flex flex-col gap-4 rounded-lg bg-surface-1 p-4">
        <h2 id="grant-header" className="text-headline">
          {copy.grant.header}
        </h2>
        <GrantForm userId={user.user_id} isTrainer={user.is_trainer} defaultPlan={plan} />
      </section>
    </div>
  );
}

async function Requests({ t, locale }: { t: Dictionary; locale: Locale }) {
  const copy = t.adminShell.plans;
  const { supabase, timeZone } = await requireAdmin();
  const { data: requests, error } = await supabase
    .from("access_requests")
    .select("id, user_id, plan_code, feature, created_at, person:profiles!access_requests_user_id_fkey(first_name, last_name, username)")
    .eq("status", "open")
    .order("created_at");
  if (error) throw new Error(`loading access requests failed: ${error.code}`);

  if (requests.length === 0) {
    return (
      <ListGroup header={copy.requests.header} headingLevel={2}>
        <p className="px-4 py-3 text-body text-ink-2">{copy.requests.empty}</p>
      </ListGroup>
    );
  }
  const features = t.plans.features;
  return (
    <ListGroup header={copy.requests.header} footer={copy.requests.footer} headingLevel={2}>
      {requests.map((request) => {
        const name = personName(request.person as PersonName | null, t.adminShell.users.noName);
        const feature = request.feature && Object.hasOwn(features, request.feature) ? features[request.feature as keyof typeof features] : request.feature;
        return (
          <div key={request.id} className={ROW_LINE}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="flex min-w-0 flex-wrap items-center gap-2 text-body">
                <Link href={`/admin/plans?user=${request.user_id}`} className="break-words text-accent-ink underline-offset-2 hover:underline">
                  {name}
                </Link>
                <PlanBadge code={request.plan_code} t={t} />
              </p>
              <time dateTime={request.created_at} className="text-footnote text-ink-2 tabular-nums">
                {formatPlanDate(locale, request.created_at, timeZone)}
              </time>
            </div>
            {feature ? <p className="text-subhead text-ink-2">{interpolate(copy.requests.feature, { feature })}</p> : null}
            <div className="flex flex-wrap gap-2 pt-2">
              <Button asChild size="sm" variant="secondary">
                <Link href={`/admin/plans?user=${request.user_id}&plan=${request.plan_code}#grant`}>{copy.requests.grant}</Link>
              </Button>
              <DeclineRequest requestId={request.id} />
            </div>
          </div>
        );
      })}
    </ListGroup>
  );
}

async function History({ t, locale }: { t: Dictionary; locale: Locale }) {
  const copy = t.adminShell.plans;
  const { supabase, timeZone } = await requireAdmin();
  const { data: grants, error } = await supabase
    .from("plan_grants")
    .select(
      "id, user_id, plan_code, reason, starts_at, expires_at, revoked_at, revoke_reason, person:profiles!plan_grants_user_id_fkey(first_name, last_name, username), admin:profiles!plan_grants_granted_by_fkey(first_name, last_name, username)",
    )
    .order("created_at", { ascending: false })
    .limit(HISTORY_SIZE);
  if (error) throw new Error(`loading the grant history failed: ${error.code}`);

  if (grants.length === 0) {
    return (
      <ListGroup header={copy.history.header} headingLevel={2}>
        <p className="px-4 py-3 text-body text-ink-2">{copy.history.empty}</p>
      </ListGroup>
    );
  }
  return (
    <ListGroup header={copy.history.header} footer={copy.history.footer} headingLevel={2}>
      {grants.map((grant) => (
        <GrantRow
          key={grant.id}
          grant={grant}
          t={t}
          locale={locale}
          timeZone={timeZone}
          person={{ id: grant.user_id, name: personName(grant.person as PersonName | null, t.adminShell.audit.deletedAccount) }}
          admin={grant.admin ? personName(grant.admin as PersonName, t.adminShell.audit.deletedAccount) : undefined}
        />
      ))}
    </ListGroup>
  );
}

async function PlansContent({ searchParams }: { searchParams: SearchParams }) {
  const [t, locale, params] = await Promise.all([getDictionary(), getLocale(), searchParams]);
  const copy = t.adminShell.plans;
  const query = (typeof params.q === "string" ? params.q : "").trim().slice(0, 100);
  const user = z.uuid().safeParse(params.user);
  const plan = isPaidPlan(params.plan) ? params.plan : undefined;

  return (
    <div className="flex flex-col gap-8">
      {user.success ? <SelectedPerson userId={user.data} plan={plan} t={t} locale={locale} /> : <FindPerson query={query} copy={copy} t={t} />}
      <Requests t={t} locale={locale} />
      <History t={t} locale={locale} />
    </div>
  );
}

/**
 * «Тарифы и выдачи» (screens.md /admin/plans, PRD §2.14-8, §4): find a person, grant Pro or Premium with an
 * optional end and a required reason, revoke with a reason, the queue of "Запросить доступ" requests and the
 * grant history. Every grant and revocation lands in the audit log and the person gets a bot message.
 */
export default async function AdminPlansPage(props: PageProps<"/[lang]/admin/plans">) {
  const t = await getDictionary();
  return (
    <Screen header={<ScreenHeader title={t.adminShell.plans.title} back={{ fallbackHref: "/admin" }} />}>
      <div className="flex w-full max-w-2xl flex-col pt-4 md:pt-0">
        <Suspense fallback={<SkeletonRows rows={6} label={t.common.loading} />}>
          <PlansContent searchParams={props.searchParams} />
        </Suspense>
      </div>
    </Screen>
  );
}
