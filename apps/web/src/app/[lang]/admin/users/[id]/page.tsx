import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";
import { BlockControls } from "@/components/admin/block-controls";
import { Screen } from "@/components/shell/screen";
import { ScreenHeader } from "@/components/shell/screen-header";
import { PersonAvatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ListGroup, ListRow } from "@/components/ui/list";
import { SkeletonRows } from "@/components/ui/skeleton";
import { INTL_LOCALE, type Locale } from "@/i18n/config";
import { interpolate } from "@/i18n/format";
import { getDictionary, getLocale } from "@/i18n/server";
import { personName } from "@/lib/admin/people";
import { requireAdmin } from "@/lib/admin/require-admin";
import { isPaidPlan, isPlanCode, PLAN_TIER } from "@/lib/plans/plans";
import { STATUS_TONE } from "@/lib/verification/status";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  return { title: t.adminShell.users.title };
}

/** "ru" → "русский"; a code Intl does not know stays as it is. */
function languageName(code: string, locale: Locale): string {
  try {
    return new Intl.DisplayNames([INTL_LOCALE[locale]], { type: "language" }).of(code) ?? code;
  } catch {
    return code;
  }
}

async function UserCard({ params }: { params: PageProps<"/[lang]/admin/users/[id]">["params"] }) {
  const [t, locale, { id }] = await Promise.all([getDictionary(), getLocale(), params]);
  const copy = t.adminShell.card;
  const userId = z.uuid().safeParse(id);
  if (!userId.success) notFound();

  const { supabase, userId: adminId, timeZone } = await requireAdmin();
  const { data: user, error } = await supabase.rpc("admin_user_card", { p_user_id: userId.data }).maybeSingle();
  if (error) throw new Error(`loading the user card failed: ${error.code}`);
  // A trainer's card, the deleted-client stub and unknown ids have no admin card.
  if (!user) notFound();
  const [trainerPlan, clientPlan] = await Promise.all([
    user.is_trainer ? supabase.rpc("effective_plan", { p_user: user.user_id, p_side: "trainer" }) : null,
    supabase.rpc("effective_plan", { p_user: user.user_id, p_side: "client" }),
  ]);
  const planBadge = (code: string | null | undefined) =>
    isPlanCode(code) ? <Badge tone={isPaidPlan(code) ? PLAN_TIER[code] : "neutral"}>{t.plans.names[code]}</Badge> : null;

  const dateTime = new Intl.DateTimeFormat(INTL_LOCALE[locale], { dateStyle: "long", timeStyle: "short", timeZone });
  const date = (value: string | null) => (value ? dateTime.format(new Date(value)) : copy.unknown);
  const name = personName(user, t.adminShell.users.noName);
  const pairs = (total: number, active: number) => interpolate(copy.pairsValue, { total: String(total), active: String(active) });
  const roles = [user.is_admin && copy.roleAdmin, user.is_trainer && copy.roleTrainer, user.client_pairs > 0 && copy.roleClient].filter(
    (role): role is string => Boolean(role),
  );
  const canBlock = !user.is_admin && user.user_id !== adminId;

  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-center gap-4 px-1">
        <PersonAvatar name={name} src={user.photo_url} size={64} decorative />
        <div className="flex min-w-0 flex-col gap-1">
          <h2 className="text-title-3 font-bold break-words">{name}</h2>
          {user.blocked_at ? (
            <div>
              <Badge tone="danger">{t.adminShell.users.badges.blocked}</Badge>
            </div>
          ) : null}
        </div>
      </div>

      <ListGroup header={copy.account} headingLevel={2}>
        <ListRow title={copy.telegramId} value={user.telegram_id} />
        {user.username ? <ListRow title={copy.username} value={`@${user.username}`} /> : null}
        {user.language_code ? <ListRow title={copy.language} value={languageName(user.language_code, locale)} /> : null}
        <ListRow title={copy.registered} subtitle={date(user.created_at)} />
        <ListRow title={copy.lastSeen} subtitle={date(user.last_seen_at)} />
      </ListGroup>

      <ListGroup header={copy.roles} headingLevel={2}>
        <ListRow title={roles.length ? roles.join(", ") : copy.noRoles} />
        {user.verification_status ? (
          <ListRow
            title={copy.verification}
            trailing={<Badge tone={STATUS_TONE[user.verification_status]}>{t.verification.status[user.verification_status]}</Badge>}
          />
        ) : null}
      </ListGroup>

      <ListGroup header={copy.plans} headingLevel={2}>
        {trainerPlan ? <ListRow title={copy.planTrainer} trailing={planBadge(trainerPlan.data)} /> : null}
        <ListRow title={copy.planClient} trailing={planBadge(clientPlan.data)} />
        <ListRow title={copy.managePlans} href={`/admin/plans?user=${user.user_id}`} />
      </ListGroup>

      <ListGroup header={copy.activity} footer={copy.activityFooter} headingLevel={2}>
        {user.is_trainer ? <ListRow title={copy.trainerPairs} value={pairs(user.trainer_pairs, user.trainer_active_pairs)} /> : null}
        <ListRow title={copy.clientPairs} value={pairs(user.client_pairs, user.client_active_pairs)} />
        {user.is_trainer ? <ListRow title={copy.sessions} value={user.sessions_led} /> : null}
        <ListRow title={copy.bookings} value={user.bookings_made} />
      </ListGroup>

      <section aria-labelledby="user-block" className="flex flex-col gap-3 rounded-lg bg-surface-1 p-4">
        <h2 id="user-block" className="text-headline">
          {copy.block.header}
        </h2>
        {user.blocked_at ? (
          <>
            <p className="text-callout text-ink-2">{interpolate(copy.block.blockedSince, { date: date(user.blocked_at) })}</p>
            {user.blocked_reason ? (
              <div className="flex flex-col gap-1 rounded-md bg-danger-soft p-3">
                <p className="text-footnote font-semibold text-danger">{copy.block.reason}</p>
                <p className="text-callout break-words text-ink">{user.blocked_reason}</p>
              </div>
            ) : null}
          </>
        ) : (
          <p className="text-callout text-ink-2">{canBlock ? copy.block.text : user.is_admin ? copy.block.admin : copy.block.self}</p>
        )}
        {canBlock || user.blocked_at ? <BlockControls userId={user.user_id} blocked={Boolean(user.blocked_at)} /> : null}
      </section>
    </div>
  );
}

/**
 * The user card (screens.md §3.5, ADM-8): who it is, roles, verification, dates, the block and counts of
 * pairs, sessions and bookings. Never the content of a client's data: no intake, measurements, photos or notes.
 */
export default async function AdminUserPage(props: PageProps<"/[lang]/admin/users/[id]">) {
  const t = await getDictionary();
  return (
    <Screen header={<ScreenHeader title={t.adminShell.users.title} back={{ fallbackHref: "/admin/users" }} />}>
      <div className="flex w-full max-w-2xl flex-col pt-4 md:pt-0">
        <Suspense fallback={<SkeletonRows rows={6} label={t.common.loading} />}>
          <UserCard params={props.params} />
        </Suspense>
      </div>
    </Screen>
  );
}
