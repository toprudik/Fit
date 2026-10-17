import type { Metadata } from "next";
import { UserPlus } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { ReferralShare } from "@/components/referrals/referral-share";
import { Screen } from "@/components/shell/screen";
import { ScreenHeader } from "@/components/shell/screen-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ListGroup, ListRow } from "@/components/ui/list";
import { Skeleton } from "@/components/ui/skeleton";
import { clientEnv } from "@/env/client";
import { INTL_LOCALE } from "@/i18n/config";
import { interpolate } from "@/i18n/format";
import { getDictionary, getLocale } from "@/i18n/server";
import { formatInviteCode, redeemPath } from "@/lib/trainer-invites/code";
import { loadTrainerReferral } from "@/lib/trainer-referrals/load";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  return { title: t.trainerReferrals.title };
}

const STATUS_TONE = { pending: "neutral", qualified: "success", void: "danger" } as const;

async function InviteTrainers() {
  const [t, locale, data] = await Promise.all([getDictionary(), getLocale(), loadTrainerReferral()]);
  const copy = t.trainerReferrals;
  if (data === "signed-out") {
    return (
      <EmptyState
        icon={UserPlus}
        title={copy.title}
        description={copy.signedOutText}
        action={
          <Button asChild>
            <Link href={`/login?next=${encodeURIComponent("/trainer/invite-trainers")}`}>{copy.signIn}</Link>
          </Button>
        }
      />
    );
  }
  if (!data) return <EmptyState icon={UserPlus} title={copy.title} description={copy.notTrainer} />;

  const date = new Intl.DateTimeFormat(INTL_LOCALE[locale], { day: "numeric", month: "long", timeZone: data.timeZone });
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2 px-1">
        <p className="text-callout">{copy.lead}</p>
        {data.bonus ? (
          <p className="text-callout">
            {data.bonus.kind === "plan_month" ? copy.bonusMonth : interpolate(copy.bonusDiscount, { percent: data.bonus.percent })}
          </p>
        ) : null}
        <p className="text-footnote text-ink-2">{copy.betaNote}</p>
      </div>
      <div className="flex flex-col gap-2">
        <ReferralShare link={new URL(redeemPath(data.code), clientEnv.NEXT_PUBLIC_APP_URL).toString()} shareText={copy.shareText} />
        <p className="px-1 text-footnote text-ink-2 tabular-nums">{interpolate(copy.code, { code: formatInviteCode(data.code) })}</p>
      </div>
      <ListGroup header={copy.listHeader}>
        {data.trainers.length ? (
          data.trainers.map((trainer) => (
            <ListRow
              key={trainer.id}
              avatar={{ name: trainer.firstName || copy.unnamed }}
              title={trainer.firstName || copy.unnamed}
              subtitle={interpolate(copy.since, { date: date.format(new Date(trainer.createdAt)) })}
              value={<Badge tone={STATUS_TONE[trainer.status]}>{copy.statuses[trainer.status]}</Badge>}
            />
          ))
        ) : (
          <p className="px-4 py-3 text-subhead text-ink-2">{copy.empty}</p>
        )}
      </ListGroup>
    </div>
  );
}

/**
 * "Пригласить тренера" (PRD wave-3 §3.2, screens.md): the trainer's link for other trainers, which opens the
 * usual redeem screen, the bonus for each invited trainer and where each one is.
 */
export default async function InviteTrainersPage() {
  const t = await getDictionary();
  return (
    <Screen header={<ScreenHeader title={t.trainerReferrals.title} back={{ fallbackHref: "/trainer/more" }} />}>
      <div className="flex w-full max-w-2xl flex-col gap-6 pt-4 md:pt-0">
        <Suspense
          fallback={
            <div role="status" aria-label={t.common.loading} className="flex flex-col gap-4">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-28 w-full" />
            </div>
          }
        >
          <InviteTrainers />
        </Suspense>
      </div>
    </Screen>
  );
}
