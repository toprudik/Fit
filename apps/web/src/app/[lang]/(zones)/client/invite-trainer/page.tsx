import type { Metadata } from "next";
import { UserPlus } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { ReferralShare } from "@/components/referrals/referral-share";
import { Screen } from "@/components/shell/screen";
import { ScreenHeader } from "@/components/shell/screen-header";
import { JoinInvitedButton } from "@/components/trainer-inviters/join-invited-button";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ListGroup, ListRow } from "@/components/ui/list";
import { Skeleton } from "@/components/ui/skeleton";
import { clientEnv } from "@/env/client";
import { INTL_LOCALE } from "@/i18n/config";
import { interpolate } from "@/i18n/format";
import { getDictionary, getLocale } from "@/i18n/server";
import { clientPairPath } from "@/lib/intake/paths";
import { formatInviteCode, redeemPath } from "@/lib/trainer-invites/code";
import { loadTrainerInviter } from "@/lib/trainer-inviters/load";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  return { title: t.trainerInviter.title };
}

async function InviteTrainer() {
  const [t, locale, data] = await Promise.all([getDictionary(), getLocale(), loadTrainerInviter()]);
  const copy = t.trainerInviter;
  if (data === "signed-out") {
    return (
      <EmptyState
        icon={UserPlus}
        title={copy.title}
        description={copy.signedOutText}
        action={
          <Button asChild>
            <Link href={`/login?next=${encodeURIComponent("/client/invite-trainer")}`}>{copy.signIn}</Link>
          </Button>
        }
      />
    );
  }
  if (data === "trainer") {
    return (
      <EmptyState
        icon={UserPlus}
        title={copy.title}
        description={copy.trainerText}
        action={
          <Button asChild>
            <Link href="/trainer/invite-trainers">{copy.trainerAction}</Link>
          </Button>
        }
      />
    );
  }

  const date = new Intl.DateTimeFormat(INTL_LOCALE[locale], { day: "numeric", month: "long", timeZone: data.timeZone });
  return (
    <div className="flex flex-col gap-6">
      <p className="px-1 text-callout">{copy.lead}</p>
      <div className="flex flex-col gap-2">
        <ReferralShare link={new URL(redeemPath(data.code), clientEnv.NEXT_PUBLIC_APP_URL).toString()} shareText={copy.shareText} />
        <p className="px-1 text-footnote text-ink-2 tabular-nums">{interpolate(copy.code, { code: formatInviteCode(data.code) })}</p>
      </div>
      <ListGroup header={copy.listHeader}>
        {data.trainers.length ? (
          data.trainers.map((trainer) => {
            const name = trainer.name || copy.unnamed;
            const since = interpolate(copy.since, { date: date.format(new Date(trainer.joinedAt)) });
            if (trainer.coachingId) {
              return (
                <ListRow
                  key={trainer.trainerId}
                  avatar={{ name, src: trainer.photoUrl }}
                  title={name}
                  subtitle={since}
                  href={clientPairPath(trainer.coachingId)}
                />
              );
            }
            return (
              <ListRow
                key={trainer.trainerId}
                avatar={{ name, src: trainer.photoUrl }}
                title={name}
                subtitle={trainer.available ? undefined : copy.unavailable}
                trailing={trainer.available ? <JoinInvitedButton trainerId={trainer.trainerId} trainerName={name} /> : null}
              />
            );
          })
        ) : (
          <p className="px-4 py-3 text-subhead text-ink-2">{copy.empty}</p>
        )}
      </ListGroup>
    </div>
  );
}

/**
 * "Пригласить своего тренера" (marketing backlog 16, Q15): a link for the person's own trainer, which opens the
 * trainer zone without an admin invite, and the trainers who came by it, each with "Заниматься" to start the pair.
 */
export default async function InviteTrainerPage() {
  const t = await getDictionary();
  return (
    <Screen header={<ScreenHeader title={t.trainerInviter.title} back={{ fallbackHref: "/client" }} />}>
      <div className="flex w-full max-w-2xl flex-col pt-4 md:pt-0">
        <Suspense
          fallback={
            <div role="status" aria-label={t.common.loading} className="flex flex-col gap-4">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-28 w-full" />
            </div>
          }
        >
          <InviteTrainer />
        </Suspense>
      </div>
    </Screen>
  );
}
