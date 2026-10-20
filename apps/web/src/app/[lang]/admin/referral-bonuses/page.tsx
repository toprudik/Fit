import type { Metadata } from "next";
import { Gift } from "lucide-react";
import { Suspense } from "react";
import { ReferralBonusGrant } from "@/components/admin/referral-bonus-grant";
import { Screen } from "@/components/shell/screen";
import { ScreenHeader } from "@/components/shell/screen-header";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { ListGroup, ListRow } from "@/components/ui/list";
import { SkeletonRows } from "@/components/ui/skeleton";
import { INTL_LOCALE } from "@/i18n/config";
import { interpolate } from "@/i18n/format";
import { getDictionary, getLocale } from "@/i18n/server";
import { requireAdmin } from "@/lib/admin/require-admin";
import { ACTIVE_WEEKS_NEEDED, groupReferralBonuses } from "@/lib/referral-bonuses/bonuses";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  return { title: t.adminReferralBonuses.title };
}

type Person = { first_name: string | null; last_name: string | null; username: string | null };

const personName = (person: Person, fallback: string) =>
  [person.first_name, person.last_name].filter(Boolean).join(" ") || (person.username ? `@${person.username}` : fallback);

async function Bonuses() {
  const [t, locale] = await Promise.all([getDictionary(), getLocale()]);
  const copy = t.adminReferralBonuses;
  const { supabase, timeZone } = await requireAdmin();
  const { data, error } = await supabase.rpc("admin_trainer_referral_bonuses");
  if (error) throw new Error(`loading the referral bonuses failed: ${error.code}`);
  const date = new Intl.DateTimeFormat(INTL_LOCALE[locale], { dateStyle: "long", timeZone });
  const groups = groupReferralBonuses(data);

  if (groups.due.length + groups.waiting.length + groups.granted.length === 0) {
    return <EmptyState icon={Gift} title={copy.emptyTitle} description={copy.emptyText} />;
  }

  const referrer = (row: (typeof data)[number]) =>
    personName({ first_name: row.referrer_first_name, last_name: row.referrer_last_name, username: row.referrer_username }, copy.noName);
  const colleague = (row: (typeof data)[number]) =>
    interpolate(copy.colleague, {
      name: personName({ first_name: row.referee_first_name, last_name: row.referee_last_name, username: row.referee_username }, copy.noName),
      date: date.format(new Date(row.invited_at)),
    });

  return (
    <div className="flex flex-col gap-6">
      {groups.due.length > 0 ? (
        <section aria-labelledby="bonuses-due" className="flex flex-col gap-2">
          <h2 id="bonuses-due" className="px-4 text-footnote text-ink-2">
            {copy.dueTitle}
          </h2>
          <ul className="flex flex-col gap-3">
            {groups.due.map((row) => (
              <li key={row.bonus_id} className="flex flex-col gap-3 rounded-lg bg-surface-1 p-4">
                <div className="flex flex-col gap-0.5">
                  <p className="text-body">{referrer(row)}</p>
                  <p className="text-subhead text-ink-2">{colleague(row)}</p>
                </div>
                <ReferralBonusGrant bonusId={row.bonus_id} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {groups.waiting.length > 0 ? (
        <ListGroup header={copy.waitingTitle} headingLevel={2}>
          {groups.waiting.map((row) => (
            <ListRow
              key={row.bonus_id}
              title={referrer(row)}
              subtitle={[
                colleague(row),
                row.referral_status === "void"
                  ? null
                  : row.bonus_kind === "plan_discount"
                    ? interpolate(copy.discount, { pct: row.discount_percent ?? 0 })
                    : interpolate(copy.weeks, { n: Math.min(row.active_weeks, ACTIVE_WEEKS_NEEDED) }),
              ]
                .filter(Boolean)
                .join(". ")}
              trailing={row.referral_status === "void" ? <Badge>{copy.voided}</Badge> : undefined}
            />
          ))}
        </ListGroup>
      ) : null}
      {groups.granted.length > 0 ? (
        <ListGroup header={copy.grantedTitle} headingLevel={2}>
          {groups.granted.map((row) => (
            <ListRow
              key={row.bonus_id}
              title={referrer(row)}
              subtitle={[
                colleague(row),
                row.plan_starts_at && row.plan_expires_at
                  ? interpolate(copy.granted, { from: date.format(new Date(row.plan_starts_at)), to: date.format(new Date(row.plan_expires_at)) })
                  : null,
              ]
                .filter(Boolean)
                .join(". ")}
            />
          ))}
        </ListGroup>
      ) : null}
    </div>
  );
}

/** «Бонусы за приглашения» in /admin (marketing backlog 7): due bonuses to give, the ones still waiting, the given ones. */
export default async function AdminReferralBonusesPage() {
  const t = await getDictionary();
  const copy = t.adminReferralBonuses;
  return (
    <Screen header={<ScreenHeader title={copy.title} back={{ fallbackHref: "/admin" }} />}>
      <div className="flex flex-col gap-4">
        <p className="text-callout text-ink-2">{copy.intro}</p>
        <Suspense fallback={<SkeletonRows rows={4} label={t.common.loading} />}>
          <Bonuses />
        </Suspense>
      </div>
    </Screen>
  );
}
