import type { Metadata } from "next";
import { Check, Gem } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { TierLock } from "@/components/plans/tier-lock";
import { Screen } from "@/components/shell/screen";
import { ScreenHeader } from "@/components/shell/screen-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ListGroup, ListRow } from "@/components/ui/list";
import { SkeletonRows } from "@/components/ui/skeleton";
import type { Dictionary } from "@/i18n/dictionaries";
import { interpolate } from "@/i18n/format";
import { getDictionary, getLocale } from "@/i18n/server";
import { personName } from "@/lib/admin/people";
import { formatPlanDate, isPaidPlan, isPlanCode, PAID_PLAN, PLAN_FEATURES, PLAN_TIER, type PlanSide } from "@/lib/plans/plans";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  return { title: t.plans.title };
}

/** A request this recent still shows as sent: request_access returns it instead of making a new one (PLAN-4). */
const REQUEST_DAY_MS = 24 * 60 * 60 * 1000;

/** Plans with a request that is open or was made within a day: their button already says "Запрос отправлен". */
function requestedPlans(requests: { plan_code: string; status: string; created_at: string }[]): Set<string> {
  const since = Date.now() - REQUEST_DAY_MS;
  return new Set(
    requests.filter((request) => request.status === "open" || new Date(request.created_at).getTime() > since).map((request) => request.plan_code),
  );
}

type SideRow = { side: PlanSide; plan_code: string; expires_at: string | null; active_clients: number | null; client_limit: number | null };

function PlanSection({ row, copy, date, requested }: { row: SideRow; copy: Dictionary["plans"]; date: (value: string) => string; requested: boolean }) {
  const code = isPlanCode(row.plan_code) ? row.plan_code : row.side === "trainer" ? "trainer_free" : "client_free";
  const paid = isPaidPlan(code);
  const headingId = `plan-${row.side}`;
  const full = row.client_limit !== null && row.active_clients !== null && row.active_clients >= row.client_limit;

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3">
      <div className="flex flex-col gap-2 rounded-lg bg-surface-1 p-4">
        <div className="flex items-center justify-between gap-3">
          <h2 id={headingId} className="text-headline">
            {copy.sides[row.side]}
          </h2>
          <Badge tone={paid ? PLAN_TIER[code] : "neutral"}>{copy.names[code]}</Badge>
        </div>
        {paid ? (
          <p className="text-callout text-ink-2">{row.expires_at ? interpolate(copy.until, { date: date(row.expires_at) }) : copy.noEnd}</p>
        ) : (
          <p className="text-callout text-ink-2">{copy.free[row.side]}</p>
        )}
        {row.client_limit !== null && row.active_clients !== null ? (
          <p className="text-callout font-semibold tabular-nums">
            {interpolate(copy.clients, { count: String(row.active_clients), limit: String(row.client_limit) })}
          </p>
        ) : null}
        {full ? <p className="text-callout text-ink-2">{copy.limitReached}</p> : null}
      </div>
      {paid ? (
        <ListGroup header={copy.included} headingLevel={3}>
          {PLAN_FEATURES[code].map((feature) => (
            <ListRow key={feature} icon={Check} iconTone="accent" title={copy.features[feature]} />
          ))}
        </ListGroup>
      ) : (
        <TierLock
          plan={PAID_PLAN[row.side]}
          title={copy.lock.whatYouGet}
          description={copy.lock[PLAN_TIER[PAID_PLAN[row.side]]]}
          requested={requested}
        />
      )}
    </section>
  );
}

async function MyPlan() {
  const [t, locale] = await Promise.all([getDictionary(), getLocale()]);
  const copy = t.plans;
  const supabase = await createSupabaseServerClient();
  const { data: session } = await supabase.auth.getClaims();
  const userId = session?.claims.sub;
  if (!userId) {
    return (
      <EmptyState
        icon={Gem}
        title={copy.title}
        description={copy.signedOutText}
        action={
          <Button asChild>
            <Link href={`/login?next=${encodeURIComponent("/settings/plan")}`}>{copy.signIn}</Link>
          </Button>
        }
      />
    );
  }

  const [plans, inherited, requests, settings] = await Promise.all([
    supabase.rpc("my_plan"),
    supabase.rpc("my_inherited_rights"),
    supabase.from("access_requests").select("plan_code, status, created_at").eq("user_id", userId),
    supabase.from("user_settings").select("time_zone").eq("user_id", userId).maybeSingle(),
  ]);
  if (plans.error) throw new Error(`loading the plan failed: ${plans.error.code}`);
  if (inherited.error) throw new Error(`loading inherited rights failed: ${inherited.error.code}`);
  if (requests.error) throw new Error(`loading access requests failed: ${requests.error.code}`);

  const timeZone = settings.data?.time_zone;
  const date = (value: string) => formatPlanDate(locale, value, timeZone);
  const requested = requestedPlans(requests.data);

  return (
    <div className="flex flex-col gap-8">
      {plans.data.map((row) => (
        <PlanSection key={row.side} row={row} copy={copy} date={date} requested={requested.has(PAID_PLAN[row.side])} />
      ))}
      {inherited.data.length > 0 ? (
        <ListGroup header={copy.inherited.header} footer={copy.inherited.footer} headingLevel={2}>
          {inherited.data.map((pair) => {
            const name = personName(pair, copy.inherited.noName);
            return <ListRow key={pair.coaching_id} avatar={{ name }} title={name} subtitle={copy.inherited.what} />;
          })}
        </ListGroup>
      ) : null}
    </div>
  );
}

/**
 * "Мой тариф" (screens.md /settings/plan, PLAN-7): the plan of each side the user has, its end, what it
 * includes, the Free trainer's client count, rights inherited from Pro trainers and "Запросить доступ".
 */
export default async function MyPlanPage() {
  const t = await getDictionary();
  return (
    <Screen header={<ScreenHeader title={t.plans.title} back={{ fallbackHref: "/settings" }} />}>
      <div className="flex w-full max-w-2xl flex-col pt-4 md:pt-0">
        <Suspense fallback={<SkeletonRows rows={4} label={t.common.loading} />}>
          <MyPlan />
        </Suspense>
      </div>
    </Screen>
  );
}
